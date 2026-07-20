const { Router } = require("express");
const multer = require("multer");
const { authenticate } = require("../../middlewares/authenticate");
const { enterpriseRateLimit } = require("../../middlewares/enterprise-rate-limit");
const {
  canAccessTenantResource,
  getOrganizationId,
  requireOrganization,
  requirePermission
} = require("../../middlewares/access-control");
const { requireOperationalAccess } = require("../../middlewares/operational-access");
const {
  getDocumentDownloadAsset,
  uploadDocumentAsset
} = require("../../services/storage");

const router = Router();
const uploadLimiter = enterpriseRateLimit({ scope: "uploads", max: 20, windowMs: 15 * 60 * 1000 });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
  },
  fileFilter: (req, file, callback) => {
    const mimeType = String(file.mimetype || "").toLowerCase();
    const isAllowed =
      mimeType === "application/pdf" ||
      mimeType.startsWith("image/jpeg") ||
      mimeType.startsWith("image/png") ||
      mimeType.startsWith("image/webp");

    callback(isAllowed ? null : new Error("Solo se permiten PDF o imagenes"), isAllowed);
  }
});

function canAccessDocument(user, document) {
  if (!canAccessTenantResource(user, document)) {
    return false;
  }

  if (user.role !== "driver") {
    return true;
  }

  return (
    (document.ownerType === "driver" && document.ownerId === user.id) ||
    (document.ownerType === "vehicle" && document.ownerId === user.vehicleId)
  );
}

async function getAccessibleOwner(req, ownerType, ownerId) {
  const owner =
    ownerType === "vehicle"
      ? await req.app.locals.store.getVehicleById(ownerId)
      : await req.app.locals.store.getUserById(ownerId);

  if (!owner || !canAccessTenantResource(req.user, owner)) {
    return null;
  }

  if (
    req.user.role === "driver" &&
    !(
      (ownerType === "driver" && ownerId === req.user.id) ||
      (ownerType === "vehicle" && ownerId === req.user.vehicleId)
    )
  ) {
    return null;
  }

  return owner;
}

router.get("/files/:storageKey", authenticate, requireOperationalAccess, async (req, res) => {
  const document = await req.app.locals.store.getDocumentByStorageKey?.(
    req.params.storageKey
  );
  const asset = await getDocumentDownloadAsset(req.params.storageKey, document);

  if (!asset || !canAccessDocument(req.user, document || asset.document)) {
    return res.status(404).json({
      ok: false,
      message: "Archivo no encontrado"
    });
  }

  if (asset.redirectUrl) {
    return res.redirect(asset.redirectUrl);
  }

  const disposition = req.query.download === "1" ? "attachment" : "inline";

  res.setHeader("Content-Type", asset.mimeType || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename="${encodeURIComponent(asset.originalFileName || "documento")}"`
  );

  asset.stream.on("error", () => {
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        message: "No fue posible abrir el archivo"
      });
      return;
    }

    res.end();
  });

  asset.stream.pipe(res);
});

router.get("/", authenticate, requireOrganization, requireOperationalAccess, async (req, res) => {
  return res.json({
    ok: true,
    data: await req.app.locals.store.getDocumentsForUser(req.user)
  });
});

router.get("/admin", authenticate, requireOrganization, requireOperationalAccess, requirePermission("canManageDocuments"), async (req, res) => {
  return res.json({
    ok: true,
    data: await req.app.locals.store.listDocuments({
      ownerType: req.query.ownerType,
      reviewStatus: req.query.reviewStatus,
      organizationId: getOrganizationId(req.user)
    })
  });
});

router.post("/", authenticate, requireOrganization, requireOperationalAccess, uploadLimiter, upload.single("file"), async (req, res, next) => {
  const storedFile = req.file;

  try {
    if (!storedFile) {
      return res.status(400).json({
        ok: false,
        message: "Debes adjuntar un archivo"
      });
    }

    const requestedOwnerType = String(req.body.ownerType || "").trim().toLowerCase();
    const ownerType =
      requestedOwnerType === "vehicle" && (req.body.ownerId || req.user.vehicleId)
        ? "vehicle"
        : "driver";
    const ownerId = String(
      req.body.ownerId || (ownerType === "vehicle" ? req.user.vehicleId : req.user.id) || ""
    ).trim();

    if (!ownerId) {
      return res.status(400).json({
        ok: false,
        message: "No se encontro el propietario del documento"
      });
    }

    if (!(await getAccessibleOwner(req, ownerType, ownerId))) {
      return res.status(404).json({
        ok: false,
        message: "Propietario del documento no encontrado"
      });
    }

    const uploadedAsset = await uploadDocumentAsset(storedFile);
    const name =
      String(req.body.name || "").trim() || storedFile.originalname || "documento";
    const createdDocument = await req.app.locals.store.createDocument({
      ownerType,
      ownerId,
      name,
      category: String(req.body.category || "evidence").trim(),
      expiresAt: req.body.expiresAt,
      fileUrl: uploadedAsset.fileUrl,
      storageKey: uploadedAsset.storageKey,
      storageType: uploadedAsset.storageType,
      mimeType: storedFile.mimetype || "",
      fileSize: storedFile.size || 0,
      uploadedBy: req.user.id,
      organizationId: getOrganizationId(req.user),
      originalFileName: storedFile.originalname || name
    });
    const documents = await req.app.locals.store.getDocumentsForUser(req.user);
    const hydratedDocument =
      documents.find((document) => document.id === createdDocument.id) || createdDocument;

    return res.status(201).json({
      ok: true,
      data: hydratedDocument
    });
  } catch (error) {
    error.statusCode =
      error.message === "La fecha de vencimiento no es valida" ||
      error.message === "ownerId y name son obligatorios"
        ? 400
        : error.message === "Propietario del documento no encontrado" ||
            error.message === "Unidad del documento no encontrada"
          ? 404
          : 422;
    error.publicMessage = "No fue posible guardar el documento";
    return next(error);
  }
});

router.patch("/:documentId/review", authenticate, requireOrganization, requireOperationalAccess, requirePermission("canManageDocuments"), async (req, res, next) => {
  try {
    const scopedDocuments = await req.app.locals.store.listDocuments({
      organizationId: getOrganizationId(req.user)
    });

    if (!scopedDocuments.some((document) => document.id === req.params.documentId)) {
      return res.status(404).json({
        ok: false,
        message: "Documento no encontrado"
      });
    }

    const reviewedDocument = await req.app.locals.store.reviewDocument(req.params.documentId, {
      reviewStatus: req.body.reviewStatus,
      reviewNotes: req.body.reviewNotes,
      reviewedBy: req.user.id
    });

    if (!reviewedDocument) {
      return res.status(404).json({
        ok: false,
        message: "Documento no encontrado"
      });
    }

    return res.json({
      ok: true,
      data: reviewedDocument
    });
  } catch (error) {
    error.statusCode = 400;
    error.publicMessage = "No fue posible revisar el documento";
    return next(error);
  }
});

module.exports = router;
