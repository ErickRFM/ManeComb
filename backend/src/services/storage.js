const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const { DocumentModel } = require("../data/models");
const {
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_CLOUD_NAME,
  DOCUMENT_STORAGE_DRIVER
} = require("../config/env");

const uploadDirectory = path.resolve(__dirname, "../../uploads/documents");
let gridFsBucket = null;

function ensureUploadDirectory() {
  fs.mkdirSync(uploadDirectory, { recursive: true });
  return uploadDirectory;
}

function getMimeExtension(mimeType) {
  const safeMimeType = String(mimeType || "").toLowerCase();

  if (safeMimeType.includes("pdf")) return ".pdf";
  if (safeMimeType.includes("png")) return ".png";
  if (safeMimeType.includes("webp")) return ".webp";
  return ".jpg";
}

function getStorageMode() {
  const normalizedDriver = String(DOCUMENT_STORAGE_DRIVER || "").trim().toLowerCase();
  const hasCloudinaryConfig =
    CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET;

  if (["mongo", "gridfs"].includes(normalizedDriver) && mongoose.connection?.db) {
    return "mongo_gridfs";
  }

  if (DOCUMENT_STORAGE_DRIVER === "cloudinary" && hasCloudinaryConfig) {
    return "cloudinary";
  }

  if (mongoose.connection?.db) {
    return "mongo_gridfs";
  }

  return "local";
}

function getStorageReadiness() {
  const mode = getStorageMode();
  const normalizedDriver = String(DOCUMENT_STORAGE_DRIVER || "").trim().toLowerCase();

  if (mode === "mongo_gridfs" || mode === "cloudinary") {
    return { mode, ready: true, missing: [] };
  }

  if (normalizedDriver === "cloudinary") {
    return {
      mode,
      ready: false,
      missing: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]
    };
  }

  return {
    mode,
    ready: false,
    missing: ["MongoDB o proveedor externo de archivos"]
  };
}

function ensureCloudinary() {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });
}

function ensureGridFsBucket() {
  if (!mongoose.connection?.db) {
    throw new Error("MongoDB no esta listo para almacenamiento de archivos");
  }

  if (!gridFsBucket) {
    gridFsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "documents"
    });
  }

  return gridFsBucket;
}

function createMongoFileUrl(storageKey) {
  return `/api/documents/files/${encodeURIComponent(storageKey)}`;
}

async function uploadToMongo(file) {
  const bucket = ensureGridFsBucket();
  const uploadStream = bucket.openUploadStream(
    file.originalname || `documento-${Date.now()}`,
    {
      contentType: file.mimetype || "application/octet-stream",
      metadata: {
        originalFileName: file.originalname || "",
        uploadedAt: new Date().toISOString()
      }
    }
  );

  return await new Promise((resolve, reject) => {
    uploadStream.on("error", reject);
    uploadStream.on("finish", () => {
      const storageKey = String(uploadStream.id);
      resolve({
        fileUrl: createMongoFileUrl(storageKey),
        storageKey,
        storageType: "mongo_gridfs"
      });
    });
    uploadStream.end(file.buffer);
  });
}

async function uploadToCloudinary(file) {
  ensureCloudinary();

  return await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "combis/documents",
        resource_type: "auto",
        type: "authenticated",
        use_filename: true,
        unique_filename: true,
        filename_override: file.originalname || `documento-${Date.now()}`
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error("No se obtuvo respuesta de Cloudinary"));
          return;
        }

        resolve({
          fileUrl: createMongoFileUrl(result.public_id),
          storageKey: result.public_id,
          storageType: "cloudinary"
        });
      }
    );

    uploadStream.end(file.buffer);
  });
}

async function uploadToLocal(file) {
  ensureUploadDirectory();
  const extension = path.extname(file.originalname || "") || getMimeExtension(file.mimetype);
  const fileName = `${Date.now()}-${randomUUID()}${extension}`;
  const absolutePath = path.resolve(uploadDirectory, fileName);

  await fs.promises.writeFile(absolutePath, file.buffer);

  return {
    fileUrl: createMongoFileUrl(fileName),
    storageKey: fileName,
    storageType: "local"
  };
}

async function uploadDocumentAsset(file) {
  if (!file?.buffer?.length) {
    throw new Error("Debes adjuntar un archivo");
  }

  if (getStorageMode() === "mongo_gridfs") return uploadToMongo(file);
  if (getStorageMode() === "cloudinary") return uploadToCloudinary(file);
  return uploadToLocal(file);
}

async function deleteDocumentAsset(document, dependencies = {}) {
  const storageKey = String(document?.storageKey || "").trim();
  const storageType = String(document?.storageType || "").trim();

  if (!storageKey || storageType === "seed") {
    return { deleted: false, alreadyMissing: true };
  }

  if (storageType === "mongo_gridfs") {
    try {
      await (dependencies.gridFsBucket || ensureGridFsBucket()).delete(getMongoObjectId(storageKey));
      return { deleted: true, alreadyMissing: false };
    } catch (error) {
      if (error?.code === 26 || /FileNotFound/i.test(String(error?.name || error?.message || ""))) {
        return { deleted: false, alreadyMissing: true };
      }
      throw error;
    }
  }

  if (storageType === "cloudinary") {
    const cloudinaryClient = dependencies.cloudinaryClient || cloudinary;
    if (!dependencies.cloudinaryClient) ensureCloudinary();
    const resourceType = String(document?.mimeType || "").toLowerCase() === "application/pdf"
      ? "raw"
      : "image";
    const result = await cloudinaryClient.uploader.destroy(storageKey, {
      invalidate: true,
      resource_type: resourceType,
      type: "authenticated"
    });

    if (["ok", "not found"].includes(String(result?.result || "").toLowerCase())) {
      return {
        deleted: String(result?.result || "").toLowerCase() === "ok",
        alreadyMissing: String(result?.result || "").toLowerCase() === "not found"
      };
    }

    throw new Error("No fue posible eliminar el archivo del proveedor");
  }

  if (storageType === "local") {
    const absolutePath = getLocalDocumentAbsolutePath(storageKey);
    try {
      await (dependencies.unlink || fs.promises.unlink)(absolutePath);
      return { deleted: true, alreadyMissing: false };
    } catch (error) {
      if (error?.code === "ENOENT") {
        return { deleted: false, alreadyMissing: true };
      }
      throw error;
    }
  }

  throw new Error("Tipo de almacenamiento documental no compatible");
}

function getLocalDocumentAbsolutePath(storageKey) {
  const absolutePath = path.resolve(uploadDirectory, String(storageKey || "").trim());
  const safeRoot = `${uploadDirectory}${path.sep}`;

  if (!absolutePath.startsWith(safeRoot)) {
    throw new Error("storageKey invalido");
  }

  return absolutePath;
}

function getMongoObjectId(storageKey) {
  try {
    return new mongoose.Types.ObjectId(String(storageKey || "").trim());
  } catch {
    throw new Error("storageKey invalido");
  }
}

function getCloudinaryDownloadUrl(document, dependencies = {}) {
  const client = dependencies.cloudinaryClient || cloudinary;
  if (!dependencies.cloudinaryClient) ensureCloudinary();
  const originalName = String(document.originalFileName || document.name || "documento");
  const format = path.extname(originalName).replace(/^\./, "").toLowerCase();
  const resourceType = String(document.mimeType || "").toLowerCase() === "application/pdf"
    ? "raw"
    : "image";
  const nowSeconds = Math.floor(Number(dependencies.now?.() || Date.now()) / 1000);

  return client.utils.private_download_url(document.storageKey, format, {
    attachment: false,
    expires_at: nowSeconds + 5 * 60,
    resource_type: resourceType,
    type: "authenticated"
  });
}

async function getDocumentDownloadAsset(storageKey, knownDocument = null, dependencies = {}) {
  const safeStorageKey = String(storageKey || "").trim();

  if (!safeStorageKey) return null;

  const document =
    knownDocument ||
    await DocumentModel.findOne({ storageKey: safeStorageKey }).lean();

  if (!document) return null;

  if (document.storageType === "cloudinary") {
    return {
      document,
      redirectUrl: getCloudinaryDownloadUrl(document, dependencies),
      mimeType: document.mimeType || "application/octet-stream",
      originalFileName: document.originalFileName || document.name || "documento"
    };
  }

  if (document.storageType === "mongo_gridfs") {
    return {
      document,
      stream: ensureGridFsBucket().openDownloadStream(getMongoObjectId(document.storageKey)),
      mimeType: document.mimeType || "application/octet-stream",
      originalFileName: document.originalFileName || document.name || "documento"
    };
  }

  if (document.storageType === "local") {
    const absolutePath = getLocalDocumentAbsolutePath(document.storageKey);

    if (!fs.existsSync(absolutePath)) return null;

    return {
      document,
      stream: fs.createReadStream(absolutePath),
      mimeType: document.mimeType || "application/octet-stream",
      originalFileName: document.originalFileName || document.name || "documento"
    };
  }

  return null;
}

/**
 * Migracion historica y EXPLICITA de archivos locales hacia GridFS.
 * Nunca se ejecuta durante el arranque normal. El comando CLI usa dry-run por
 * defecto; solo `--apply` permite mutar documentos y eliminar el archivo local.
 */
async function migrateLegacyLocalDocumentsToMongo({ dryRun = true } = {}) {
  if (getStorageMode() !== "mongo_gridfs") {
    return {
      enabled: false,
      dryRun,
      scanned: 0,
      eligible: 0,
      migrated: 0,
      missing: 0,
      failed: 0
    };
  }

  const legacyDocuments = await DocumentModel.find({
    storageType: "local",
    storageKey: { $nin: ["", null] }
  }).lean();
  const summary = {
    enabled: true,
    dryRun,
    scanned: legacyDocuments.length,
    eligible: 0,
    migrated: 0,
    missing: 0,
    failed: 0
  };

  for (const document of legacyDocuments) {
    let migratedAsset = null;
    let durableReferenceCommitted = false;

    try {
      const absolutePath = getLocalDocumentAbsolutePath(document.storageKey);

      if (!fs.existsSync(absolutePath)) {
        summary.missing += 1;
        continue;
      }

      summary.eligible += 1;
      if (dryRun) continue;

      migratedAsset = await uploadToMongo({
        buffer: await fs.promises.readFile(absolutePath),
        mimetype: document.mimeType || "application/octet-stream",
        originalname: document.originalFileName || document.name || `documento-${document._id}`
      });

      // La sustitucion del puntero local es CAS: si otro proceso ya modifico el
      // documento, este worker no puede borrar el archivo original ni dejar el
      // upload nuevo huerfano.
      const updateResult = await DocumentModel.updateOne(
        { _id: document._id, storageType: "local", storageKey: document.storageKey },
        {
          $set: {
            fileUrl: migratedAsset.fileUrl,
            storageKey: migratedAsset.storageKey,
            storageType: migratedAsset.storageType
          }
        }
      );
      const matchedCount = Number(updateResult?.matchedCount ?? updateResult?.n ?? 0);
      const modifiedCount = Number(updateResult?.modifiedCount ?? updateResult?.nModified ?? 0);

      if (matchedCount !== 1 || modifiedCount !== 1) {
        await deleteDocumentAsset(migratedAsset).catch(() => undefined);
        migratedAsset = null;
        summary.failed += 1;
        continue;
      }

      durableReferenceCommitted = true;
      summary.migrated += 1;
      // A partir de aqui Mongo/GridFS ya es autoridad. Un fallo de limpieza local
      // no puede provocar rollback del asset al que el documento ya apunta.
      await fs.promises.unlink(absolutePath).catch(() => undefined);
    } catch {
      if (migratedAsset && !durableReferenceCommitted) {
        await deleteDocumentAsset(migratedAsset).catch(() => undefined);
      }
      summary.failed += 1;
    }
  }

  return summary;
}

module.exports = {
  deleteDocumentAsset,
  getCloudinaryDownloadUrl,
  getDocumentDownloadAsset,
  getStorageMode,
  getStorageReadiness,
  migrateLegacyLocalDocumentsToMongo,
  uploadDocumentAsset
};
