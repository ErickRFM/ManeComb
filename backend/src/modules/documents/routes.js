const { Router } = require("express");
const multer = require("multer");
const { authenticate } = require("../../middlewares/authenticate");
const { enterpriseRateLimit } = require("../../middlewares/enterprise-rate-limit");
const {
  canAccessTenantResource,
  getOrganizationId,
  hasPermission,
  requireOrganization,
  requirePermission
} = require("../../middlewares/access-control");
const { requireOperationalAccess } = require("../../middlewares/operational-access");
const {
  resolveDocumentRecipient,
  sendDocumentEmail
} = require("../../services/domain-email-events");
const {
  deleteDocumentAsset,
  getDocumentDownloadAsset,
  uploadDocumentAsset
} = require("../../services/storage");

const router = Router();
const uploadLimiter = enterpriseRateLimit({ scope: "uploads", max: 20, windowMs: 15 * 60 * 1000 });
const DRIVER_DOCUMENT_CATEGORY = "license";
const DRIVER_MUTABLE_REVIEW_STATUSES = new Set(["pending_review", "rejected"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const mimeType = String(file.mimetype || "").toLowerCase();
    const isAllowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp"
    ].includes(mimeType);
    callback(isAllowed ? null : new Error("Solo se permiten PDF o imagenes"), isAllowed);
  }
});

function receiveDocumentFile(req, res, next) {
  upload.single("file")(req, res, (error) => {
    if (!error) return next();
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    return res.status(tooLarge ? 413 : 415).json({
      ok: false,
      message: tooLarge
        ? "El archivo supera el limite de 15 MB"
        : "Solo se permiten archivos PDF, JPG, PNG o WEBP"
    });
  });
}

function canAccessDocument(user, document) {
  if (!document || !canAccessTenantResource(user, document)) return false;
  if (user.role !== "driver") return true;
  return (
    (document.ownerType === "driver" && document.ownerId === user.id) ||
    (document.ownerType === "vehicle" && document.ownerId === user.vehicleId)
  );
}

function canDriverMutateDocument(document) {
  return DRIVER_MUTABLE_REVIEW_STATUSES.has(document.reviewStatus) || document.status === "vencido";
}

function resolveUploadOwner(user, body = {}) {
  if (user?.role === "driver") {
    return { ownerType: "driver", ownerId: String(user.id || "").trim() };
  }
  const requestedOwnerType = String(body.ownerType || "").trim().toLowerCase();
  const ownerType = requestedOwnerType === "vehicle" && (body.ownerId || user?.vehicleId)
    ? "vehicle"
    : "driver";
  return {
    ownerType,
    ownerId: String(body.ownerId || (ownerType === "vehicle" ? user?.vehicleId : user?.id) || "").trim()
  };
}

async function getAccessibleOwner(req, ownerType, ownerId) {
  const owner = ownerType === "vehicle"
    ? await req.app.locals.store.getVehicleById(ownerId)
    : await req.app.locals.store.getUserById(ownerId);
  if (!owner || !canAccessTenantResource(req.user, owner)) return null;
  if (
    req.user.role === "driver" &&
    !(
      (ownerType === "driver" && ownerId === req.user.id) ||
      (ownerType === "vehicle" && ownerId === req.user.vehicleId)
    )
  ) return null;
  return owner;
}

function getDocumentScope(req) {
  const organizationId = getOrganizationId(req.user);
  return organizationId ? { organizationId } : {};
}

async function getScopedDocument(req, documentId, includeDeleted = false) {
  return req.app.locals.store.getDocumentById(documentId, {
    ...getDocumentScope(req),
    includeDeleted
  });
}

function sanitizeDownloadFileName(value) {
  const sanitized = String(value || "documento")
    .replace(/[\r\n\0]/g, "")
    .replace(/[\\/\":*?<>|]/g, "-")
    .trim()
    .slice(0, 120);
  return sanitized || "documento";
}

function validateDocumentMetadata(body = {}) {
  const metadata = {};
  if (body.name !== undefined) {
    metadata.name = String(body.name || "").trim();
    if (!metadata.name) throw new Error("El nombre del documento es obligatorio");
  }
  if (body.category !== undefined) {
    metadata.category = String(body.category || "").trim().toLowerCase();
    if (metadata.category !== DRIVER_DOCUMENT_CATEGORY) {
      throw new Error("El tipo de documento no esta permitido");
    }
  }
  if (body.expiresAt !== undefined) {
    const expiresAt = new Date(body.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) throw new Error("La fecha de vencimiento no es valida");
    metadata.expiresAt = expiresAt.toISOString();
  }
  return metadata;
}

async function sendDocumentEventSafely(store, document, eventType) {
  try {
    const recipientContext = await resolveDocumentRecipient(store, document);
    if (recipientContext) await sendDocumentEmail(document, recipientContext, eventType);
  } catch (error) {
    console.error("document_email_failed", {
      documentId: document?.id || null,
      eventType,
      error: String(error?.message || "delivery_failed").slice(0, 120)
    });
  }
}

router.get("/files/:storageKey", authenticate, requireOperationalAccess, async (req, res) => {
  const document = await req.app.locals.store.getDocumentByStorageKey?.(
    req.params.storageKey,
    getDocumentScope(req)
  );
  if (!document || !canAccessDocument(req.user, document)) {
    return res.status(404).json({ ok: false, message: "Archivo no encontrado" });
  }

  const asset = await getDocumentDownloadAsset(req.params.storageKey, document);
  if (!asset) return res.status(404).json({ ok: false, message: "Archivo no encontrado" });
  if (asset.redirectUrl) return res.redirect(asset.redirectUrl);

  const disposition = req.query.download === "1" ? "attachment" : "inline";
  const fileName = sanitizeDownloadFileName(asset.originalFileName || "documento");
  res.setHeader("Content-Type", asset.mimeType || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
  );
  asset.stream.on("error", () => {
    if (!res.headersSent) {
      res.status(500).json({ ok: false, message: "No fue posible abrir el archivo" });
      return;
    }
    res.end();
  });
  return asset.stream.pipe(res);
});

router.get("/", authenticate, requireOrganization, requireOperationalAccess, async (req, res) => {
  return res.json({ ok: true, data: await req.app.locals.store.getDocumentsForUser(req.user) });
});

router.get("/admin", authenticate, requireOrganization, requireOperationalAccess, requirePermission("canManageDocuments"), async (req, res) => {
  const includeDeleted = req.query.includeDeleted === "true";
  return res.json({
    ok: true,
    data: await req.app.locals.store.listDocuments({
      ownerType: req.query.ownerType,
      reviewStatus: req.query.reviewStatus,
      organizationId: getOrganizationId(req.user),
      includeDeleted
    })
  });
});

router.get("/:documentId/history", authenticate, requireOrganization, requireOperationalAccess, async (req, res) => {
  const document = await getScopedDocument(req, req.params.documentId, true);
  if (!document || !canAccessDocument(req.user, document)) {
    return res.status(404).json({ ok: false, message: "Documento no encontrado" });
  }
  const versions = await req.app.locals.store.listDocumentVersions(
    req.params.documentId,
    getDocumentScope(req)
  );
  return res.json({ ok: true, data: versions });
});

router.post("/", authenticate, requireOrganization, requireOperationalAccess, uploadLimiter, receiveDocumentFile, async (req, res, next) => {
  const storedFile = req.file;
  let uploadedAsset = null;
  let createdDocument = null;
  try {
    if (!storedFile) return res.status(400).json({ ok: false, message: "Debes adjuntar un archivo" });
    if (req.user.role !== "driver" && !hasPermission(req.user, "canManageDocuments")) {
      return res.status(403).json({ ok: false, message: "No tienes permiso para realizar esta accion" });
    }
    const { ownerId, ownerType } = resolveUploadOwner(req.user, req.body);
    if (!ownerId) return res.status(400).json({ ok: false, message: "No se encontro el propietario del documento" });
    if (!(await getAccessibleOwner(req, ownerType, ownerId))) {
      return res.status(404).json({ ok: false, message: "Propietario del documento no encontrado" });
    }

    const metadata = validateDocumentMetadata({
      name: String(req.body.name || "").trim() || storedFile.originalname || "documento",
      category: String(req.body.category || DRIVER_DOCUMENT_CATEGORY).trim(),
      expiresAt: req.body.expiresAt
    });
    uploadedAsset = await uploadDocumentAsset(storedFile);
    createdDocument = await req.app.locals.store.createDocument({
      ownerType,
      ownerId,
      ...metadata,
      ...uploadedAsset,
      mimeType: storedFile.mimetype || "",
      fileSize: storedFile.size || 0,
      uploadedBy: req.user.id,
      organizationId: getOrganizationId(req.user),
      originalFileName: storedFile.originalname || metadata.name
    });
    const documents = await req.app.locals.store.getDocumentsForUser(req.user);
    const hydratedDocument = documents.find((document) => document.id === createdDocument.id) || createdDocument;
    await sendDocumentEventSafely(req.app.locals.store, hydratedDocument, "DOCUMENT_UPLOADED");
    return res.status(201).json({ ok: true, data: hydratedDocument });
  } catch (error) {
    if (uploadedAsset && !createdDocument) {
      await deleteDocumentAsset(uploadedAsset).catch(() => undefined);
    }
    error.statusCode = /fecha|obligatorio|tipo de documento/i.test(String(error.message)) ? 400 : 422;
    error.publicMessage = "No fue posible guardar el documento";
    return next(error);
  }
});

router.patch("/:documentId", authenticate, requireOrganization, requireOperationalAccess, async (req, res, next) => {
  try {
    const document = await getScopedDocument(req, req.params.documentId);
    if (!document || !canAccessDocument(req.user, document)) {
      return res.status(404).json({ ok: false, message: "Documento no encontrado" });
    }
    if (req.user.role === "driver" && !canDriverMutateDocument(document)) {
      return res.status(409).json({ ok: false, message: "El documento aprobado no puede modificarse" });
    }
    if (req.user.role !== "driver" && !hasPermission(req.user, "canManageDocuments")) {
      return res.status(403).json({ ok: false, message: "No tienes permiso para realizar esta accion" });
    }

    const metadata = validateDocumentMetadata(req.body);
    const updated = await req.app.locals.store.updateDocument(req.params.documentId, {
      ...metadata,
      ...getDocumentScope(req)
    });
    if (!updated) return res.status(404).json({ ok: false, message: "Documento no encontrado" });
    const { metadataChanged, ...responseDocument } = updated;
    return res.json({ ok: true, data: responseDocument });
  } catch (error) {
    error.statusCode = 400;
    error.publicMessage = "No fue posible actualizar el documento";
    return next(error);
  }
});

router.post("/:documentId/replace", authenticate, requireOrganization, requireOperationalAccess, uploadLimiter, receiveDocumentFile, async (req, res, next) => {
  let uploadedAsset = null;
  let replacement = null;
  try {
    const current = await getScopedDocument(req, req.params.documentId);
    if (!current || !canAccessDocument(req.user, current)) {
      return res.status(404).json({ ok: false, message: "Documento no encontrado" });
    }
    if (req.user.role === "driver" && !canDriverMutateDocument(current)) {
      return res.status(409).json({ ok: false, message: "Este documento no puede reemplazarse" });
    }
    if (req.user.role !== "driver" && !hasPermission(req.user, "canManageDocuments")) {
      return res.status(403).json({ ok: false, message: "No tienes permiso para realizar esta accion" });
    }
    if (!req.file) return res.status(400).json({ ok: false, message: "Debes adjuntar un archivo" });

    const metadata = validateDocumentMetadata({
      name: req.body.name === undefined ? current.name : req.body.name,
      category: current.category,
      expiresAt: req.body.expiresAt || current.expiresAt
    });
    uploadedAsset = await uploadDocumentAsset(req.file);
    replacement = await req.app.locals.store.replaceDocument(req.params.documentId, {
      ...metadata,
      ...uploadedAsset,
      ...getDocumentScope(req),
      mimeType: req.file.mimetype || "",
      fileSize: req.file.size || 0,
      uploadedBy: req.user.id,
      originalFileName: req.file.originalname || metadata.name
    });
    if (!replacement) {
      await deleteDocumentAsset(uploadedAsset).catch(() => undefined);
      uploadedAsset = null;
      return res.status(409).json({ ok: false, message: "El documento ya fue reemplazado" });
    }
    await sendDocumentEventSafely(req.app.locals.store, replacement, "DOCUMENT_UPLOADED");
    return res.status(201).json({ ok: true, data: replacement });
  } catch (error) {
    if (uploadedAsset && !replacement) await deleteDocumentAsset(uploadedAsset).catch(() => undefined);
    error.statusCode = /fecha|obligatorio|tipo de documento/i.test(String(error.message)) ? 400 : 422;
    error.publicMessage = "No fue posible reemplazar el documento";
    return next(error);
  }
});

router.patch("/:documentId/review", authenticate, requireOrganization, requireOperationalAccess, requirePermission("canManageDocuments"), async (req, res, next) => {
  try {
    const reviewStatus = String(req.body.reviewStatus || "").trim();
    const reviewNotes = String(req.body.reviewNotes || "").trim();
    if (!["approved", "rejected"].includes(reviewStatus)) {
      return res.status(400).json({ ok: false, message: "Estado de revision no permitido" });
    }
    if (reviewStatus === "rejected" && !reviewNotes) {
      return res.status(400).json({ ok: false, message: "Debes indicar el motivo del rechazo" });
    }
    const document = await getScopedDocument(req, req.params.documentId);
    if (!document) return res.status(404).json({ ok: false, message: "Documento no encontrado" });
    const reviewedDocument = await req.app.locals.store.reviewDocument(req.params.documentId, {
      reviewStatus,
      reviewNotes,
      reviewedBy: req.user.id,
      ...getDocumentScope(req)
    });
    if (!reviewedDocument) return res.status(404).json({ ok: false, message: "Documento no encontrado" });
    const { reviewChanged, ...responseDocument } = reviewedDocument;
    if (reviewChanged) {
      await sendDocumentEventSafely(
        req.app.locals.store,
        responseDocument,
        reviewStatus === "approved" ? "DOCUMENT_APPROVED" : "DOCUMENT_REJECTED"
      );
    }
    return res.json({ ok: true, data: responseDocument });
  } catch (error) {
    error.statusCode = 400;
    error.publicMessage = "No fue posible revisar el documento";
    return next(error);
  }
});

router.delete("/:documentId", authenticate, requireOrganization, requireOperationalAccess, async (req, res, next) => {
  try {
    const document = await getScopedDocument(req, req.params.documentId, true);
    if (!document || !canAccessDocument(req.user, document)) {
      return res.status(404).json({ ok: false, message: "Documento no encontrado" });
    }
    const isManager = hasPermission(req.user, "canManageDocuments");
    if (req.user.role === "driver" && !document.deletedAt && !DRIVER_MUTABLE_REVIEW_STATUSES.has(document.reviewStatus)) {
      return res.status(409).json({ ok: false, message: "Un documento aprobado debe reemplazarse o renovarse" });
    }
    if (req.user.role !== "driver" && !isManager) {
      return res.status(403).json({ ok: false, message: "No tienes permiso para realizar esta accion" });
    }
    const deleteReason = String(req.body?.deleteReason || "").trim();
    if (isManager && document.reviewStatus === "approved" && !document.deletedAt && !deleteReason) {
      return res.status(400).json({ ok: false, message: "Debes indicar el motivo de eliminacion" });
    }

    let deleted = document.deletedAt
      ? document
      : await req.app.locals.store.softDeleteDocument(req.params.documentId, {
          ...getDocumentScope(req),
          deletedBy: req.user.id,
          deleteReason
        });
    let cleanupPending = false;
    if (!deleted.assetDeletedAt) {
      const allDocuments = await req.app.locals.store.listDocuments({
        includeDeleted: true,
        includeSuperseded: true
      });
      const sharedAsset = allDocuments.some((entry) =>
        entry.id !== deleted.id && entry.storageKey && entry.storageKey === deleted.storageKey && !entry.deletedAt
      );
      try {
        if (!sharedAsset) await deleteDocumentAsset(deleted);
        deleted = await req.app.locals.store.softDeleteDocument(req.params.documentId, {
          ...getDocumentScope(req),
          assetDeletedAt: new Date().toISOString(),
          recordAssetAttempt: true
        });
      } catch {
        cleanupPending = true;
        deleted = await req.app.locals.store.softDeleteDocument(req.params.documentId, {
          ...getDocumentScope(req),
          assetDeletionError: "cleanup_pending",
          recordAssetAttempt: true
        });
        console.error("document_asset_cleanup_failed", { documentId: deleted?.id || req.params.documentId });
      }
    }
    return res.json({ ok: true, data: { ...deleted, cleanupPending } });
  } catch (error) {
    error.statusCode = 422;
    error.publicMessage = "No fue posible eliminar el documento";
    return next(error);
  }
});

module.exports = router;
module.exports.canAccessDocument = canAccessDocument;
module.exports.canDriverMutateDocument = canDriverMutateDocument;
module.exports.resolveUploadOwner = resolveUploadOwner;
module.exports.sanitizeDownloadFileName = sanitizeDownloadFileName;
