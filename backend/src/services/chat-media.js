const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const {
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_CLOUD_NAME,
  DOCUMENT_STORAGE_DRIVER
} = require("../config/env");

const uploadDirectory = path.resolve(__dirname, "../../uploads/chat-media");
const GRIDFS_BUCKET_NAME = "chat_media";
const LOCAL_PREFIX = "local__";
const MONGO_PREFIX = "mongo__";
const CLOUDINARY_PREFIX = "cloudinary__";

fs.mkdirSync(uploadDirectory, {
  recursive: true
});

let gridFsBucket = null;

function getMimeExtension(mimeType) {
  const safeMimeType = String(mimeType || "").toLowerCase();

  if (safeMimeType.includes("mp3")) {
    return ".mp3";
  }

  if (safeMimeType.includes("ogg")) {
    return ".ogg";
  }

  if (safeMimeType.includes("wav")) {
    return ".wav";
  }

  if (safeMimeType.includes("webm")) {
    return ".webm";
  }

  if (safeMimeType.includes("image/jpeg") || safeMimeType.includes("image/jpg")) {
    return ".jpg";
  }

  if (safeMimeType.includes("image/png")) {
    return ".png";
  }

  if (safeMimeType.includes("image/gif")) {
    return ".gif";
  }

  if (safeMimeType.includes("video/mp4")) {
    return ".mp4";
  }

  if (safeMimeType.includes("video/quicktime")) {
    return ".mov";
  }

  return ".m4a";
}

function getMediaMimeTypeFromName(fileName) {
  const normalizedName = String(fileName || "").toLowerCase();

  if (normalizedName.endsWith(".mp3")) {
    return "audio/mpeg";
  }

  if (normalizedName.endsWith(".ogg")) {
    return "audio/ogg";
  }

  if (normalizedName.endsWith(".wav")) {
    return "audio/wav";
  }

  if (normalizedName.endsWith(".webm")) {
    return "audio/webm";
  }

  if (normalizedName.endsWith(".jpg") || normalizedName.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (normalizedName.endsWith(".png")) {
    return "image/png";
  }

  if (normalizedName.endsWith(".gif")) {
    return "image/gif";
  }

  if (normalizedName.endsWith(".mp4")) {
    return "video/mp4";
  }

  if (normalizedName.endsWith(".mov")) {
    return "video/quicktime";
  }

  return "audio/mp4";
}

function buildMediaUrl(storageKey) {
  return `/api/chat/media/${encodeURIComponent(storageKey)}`;
}

function ensureGridFsBucket() {
  if (!mongoose.connection?.db) {
    throw new Error("MongoDB no esta listo para multimedia de chat");
  }

  if (!gridFsBucket) {
    gridFsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: GRIDFS_BUCKET_NAME
    });
  }

  return gridFsBucket;
}

function ensureCloudinary() {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });
}

function getStorageMode() {
  const normalizedDriver = String(DOCUMENT_STORAGE_DRIVER || "").trim().toLowerCase();
  const hasCloudinaryConfig =
    CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET;

  if (normalizedDriver === "cloudinary" && hasCloudinaryConfig) {
    return "cloudinary";
  }

  if (mongoose.connection?.db) {
    return "mongo_gridfs";
  }

  return "local";
}

async function uploadToMongo(file) {
  const bucket = ensureGridFsBucket();
  const uploadStream = bucket.openUploadStream(
    file.originalname || `chat-media-${Date.now()}${getMimeExtension(file.mimetype)}`,
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
      const rawKey = String(uploadStream.id);
      const storageKey = `${MONGO_PREFIX}${rawKey}`;

      resolve({
        fileUrl: buildMediaUrl(storageKey),
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
        folder: "combis/chat-media",
        resource_type: "auto",
        type: "authenticated",
        use_filename: true,
        unique_filename: true,
        filename_override: file.originalname || `chat-media-${Date.now()}`
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error("No se obtuvo respuesta de Cloudinary"));
          return;
        }

        resolve({
          fileUrl: buildMediaUrl(`${CLOUDINARY_PREFIX}${result.public_id}`),
          storageKey: `${CLOUDINARY_PREFIX}${result.public_id}`,
          storageType: "cloudinary"
        });
      }
    );

    uploadStream.end(file.buffer);
  });
}

async function uploadToLocal(file) {
  const extension = path.extname(file.originalname || "") || getMimeExtension(file.mimetype);
  const fileName = `${Date.now()}-${randomUUID()}${extension}`;
  const absolutePath = path.resolve(uploadDirectory, fileName);

  await fs.promises.writeFile(absolutePath, file.buffer);

  return {
    fileUrl: buildMediaUrl(`${LOCAL_PREFIX}${fileName}`),
    storageKey: `${LOCAL_PREFIX}${fileName}`,
    storageType: "local"
  };
}

async function uploadChatMediaAsset(file) {
  if (!file?.buffer?.length) {
    throw new Error("Debes adjuntar un archivo");
  }

  const mimeType = String(file.mimetype || "").toLowerCase();
  const isAudio = mimeType.startsWith("audio/");
  const isImage = mimeType.startsWith("image/");
  const isVideo = mimeType.startsWith("video/");

  if (!isAudio && !isImage && !isVideo) {
    throw new Error("Tipo de archivo no soportado para chat");
  }

  if (getStorageMode() === "cloudinary") {
    return await uploadToCloudinary(file);
  }

  if (getStorageMode() === "mongo_gridfs") {
    return await uploadToMongo(file);
  }

  return await uploadToLocal(file);
}

async function uploadChatAudioAsset(file) {
  if (!String(file.mimetype || "").toLowerCase().startsWith("audio/")) {
    throw new Error("Solo se permiten audios para el canal de radio");
  }

  return uploadChatMediaAsset(file);
}

function getMongoObjectId(storageKey) {
  try {
    return new mongoose.Types.ObjectId(
      String(storageKey || "").replace(MONGO_PREFIX, "").trim()
    );
  } catch {
    throw new Error("storageKey invalido");
  }
}

async function getMongoAsset(storageKey) {
  const objectId = getMongoObjectId(storageKey);
  const db = mongoose.connection?.db;

  if (!db) {
    return null;
  }

  const fileEntry = await db.collection(`${GRIDFS_BUCKET_NAME}.files`).findOne({
    _id: objectId
  });

  if (!fileEntry) {
    return null;
  }

  return {
    stream: ensureGridFsBucket().openDownloadStream(objectId),
    mimeType: fileEntry.contentType || "audio/mp4",
    originalFileName: fileEntry.filename || "voice-note"
  };
}

async function getLocalAsset(storageKey) {
  const fileName = String(storageKey || "").replace(LOCAL_PREFIX, "").trim();
  const absolutePath = path.resolve(uploadDirectory, fileName);
  const safeRoot = `${uploadDirectory}${path.sep}`;

  if (!absolutePath.startsWith(safeRoot)) {
    throw new Error("storageKey invalido");
  }

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  return {
    stream: fs.createReadStream(absolutePath),
    mimeType: getMediaMimeTypeFromName(fileName),
    originalFileName: fileName
  };
}

async function getChatMediaAsset(storageKey) {
  const safeStorageKey = String(storageKey || "").trim();

  if (!safeStorageKey) {
    return null;
  }

  if (safeStorageKey.startsWith(MONGO_PREFIX)) {
    return await getMongoAsset(safeStorageKey);
  }

  if (safeStorageKey.startsWith(LOCAL_PREFIX)) {
    return await getLocalAsset(safeStorageKey);
  }

  if (safeStorageKey.startsWith(CLOUDINARY_PREFIX)) {
    return {
      redirectUrl: cloudinary.url(safeStorageKey.replace(CLOUDINARY_PREFIX, ""), {
        resource_type: "auto",
        secure: true,
        sign_url: true,
        type: "authenticated"
      })
    };
  }

  return null;
}

module.exports = {
  getChatMediaAsset,
  uploadChatAudioAsset,
  uploadChatMediaAsset
};
