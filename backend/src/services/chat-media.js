const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { Readable } = require("stream");
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
          storageType: "cloudinary",
          resourceType: result.resource_type || null
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

function getLocalAbsolutePath(storageKey) {
  const fileName = String(storageKey || "").replace(LOCAL_PREFIX, "").trim();
  const absolutePath = path.resolve(uploadDirectory, fileName);
  const safeRoot = `${uploadDirectory}${path.sep}`;

  if (!absolutePath.startsWith(safeRoot)) {
    throw new Error("storageKey invalido");
  }

  return absolutePath;
}

async function deleteChatMediaAsset(assetOrStorageKey) {
  const descriptor = assetOrStorageKey && typeof assetOrStorageKey === "object"
    ? assetOrStorageKey
    : { storageKey: assetOrStorageKey };
  const storageKey = String(descriptor.storageKey || "").trim();

  if (!storageKey) return false;

  if (storageKey.startsWith(LOCAL_PREFIX)) {
    const absolutePath = getLocalAbsolutePath(storageKey);
    try {
      await fs.promises.unlink(absolutePath);
      return true;
    } catch (error) {
      if (error?.code === "ENOENT") return true;
      throw error;
    }
  }

  if (storageKey.startsWith(MONGO_PREFIX)) {
    if (!mongoose.connection?.db) return false;
    try {
      await ensureGridFsBucket().delete(getMongoObjectId(storageKey));
      return true;
    } catch (error) {
      if (error?.code === "ENOENT") return true;
      throw error;
    }
  }

  if (storageKey.startsWith(CLOUDINARY_PREFIX)) {
    ensureCloudinary();
    const publicId = storageKey.replace(CLOUDINARY_PREFIX, "");
    const result = await cloudinary.uploader.destroy(publicId, {
      invalidate: true,
      resource_type: descriptor.resourceType || "image",
      type: "authenticated"
    });
    return ["ok", "not found"].includes(String(result?.result || "").toLowerCase());
  }

  return false;
}

function normalizeRangeOptions(options = {}) {
  const start = Number(options.start);
  const end = Number(options.end);

  return {
    start: Number.isFinite(start) && start >= 0 ? Math.floor(start) : null,
    end: Number.isFinite(end) && end >= 0 ? Math.floor(end) : null
  };
}

async function getMongoAsset(storageKey, options = {}) {
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

  const range = normalizeRangeOptions(options);
  const streamOptions = {};

  if (range.start !== null) {
    streamOptions.start = range.start;
  }

  if (range.end !== null) {
    streamOptions.end = range.end + 1;
  }

  return {
    stream: ensureGridFsBucket().openDownloadStream(objectId, streamOptions),
    mimeType: fileEntry.contentType || "audio/mp4",
    originalFileName: fileEntry.filename || "voice-note",
    size: Number(fileEntry.length || 0)
  };
}

async function getLocalAsset(storageKey, options = {}) {
  const fileName = String(storageKey || "").replace(LOCAL_PREFIX, "").trim();
  const absolutePath = getLocalAbsolutePath(storageKey);

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  const stat = await fs.promises.stat(absolutePath);
  const range = normalizeRangeOptions(options);
  const streamOptions = {};

  if (range.start !== null) {
    streamOptions.start = range.start;
  }

  if (range.end !== null) {
    streamOptions.end = range.end;
  }

  return {
    stream: fs.createReadStream(absolutePath, streamOptions),
    mimeType: getMediaMimeTypeFromName(fileName),
    originalFileName: fileName,
    size: stat.size
  };
}

async function getChatMediaAsset(storageKey, options = {}) {
  const safeStorageKey = String(storageKey || "").trim();

  if (!safeStorageKey) {
    return null;
  }

  if (safeStorageKey.startsWith(MONGO_PREFIX)) {
    return await getMongoAsset(safeStorageKey, options);
  }

  if (safeStorageKey.startsWith(LOCAL_PREFIX)) {
    return await getLocalAsset(safeStorageKey, options);
  }

  if (safeStorageKey.startsWith(CLOUDINARY_PREFIX)) {
    ensureCloudinary();
    return {
      remoteUrl: cloudinary.url(safeStorageKey.replace(CLOUDINARY_PREFIX, ""), {
        resource_type: "auto",
        secure: true,
        sign_url: true,
        type: "authenticated"
      })
    };
  }

  return null;
}

function parseMediaRange(rangeHeader, size) {
  if (!rangeHeader || !size) {
    return null;
  }

  const match = String(rangeHeader).match(/^bytes=(\d*)-(\d*)$/);

  if (!match) {
    return null;
  }

  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : size - 1;

  if (!match[1] && match[2]) {
    const suffixLength = Number(match[2]);
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null;
  }

  return {
    start: Math.floor(start),
    end: Math.min(Math.floor(end), size - 1)
  };
}

function copyRemoteMediaHeaders(upstream, res) {
  for (const headerName of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified"
  ]) {
    const value = upstream.headers.get(headerName);
    if (value) {
      res.setHeader(headerName, value);
    }
  }
}

async function proxyRemoteChatMediaAsset(req, res, remoteUrl, options = {}) {
  const requestHeaders = {};
  const requestedRange = String(req.headers.range || "").trim();

  if (requestedRange) {
    requestHeaders.Range = requestedRange;
  }

  let upstream;
  try {
    upstream = await fetch(remoteUrl, {
      headers: requestHeaders,
      redirect: "follow"
    });
  } catch {
    return false;
  }

  if (!upstream.ok) {
    return false;
  }

  res.status(upstream.status);
  copyRemoteMediaHeaders(upstream, res);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(options.fileName || "chat-media")}"`
  );

  if (!upstream.body) {
    res.end();
    return true;
  }

  const stream = Readable.fromWeb(upstream.body);
  stream.on("error", () => {
    if (!res.writableEnded) {
      res.destroy();
    }
  });
  stream.pipe(res);
  return true;
}

async function streamChatMediaAsset(req, res, storageKey, options = {}) {
  const baseAsset = await getChatMediaAsset(storageKey);

  if (!baseAsset) {
    return false;
  }

  if (baseAsset.remoteUrl) {
    return await proxyRemoteChatMediaAsset(req, res, baseAsset.remoteUrl, options);
  }

  const size = Number(baseAsset.size || 0);
  const range = parseMediaRange(req.headers.range, size);
  const asset =
    range && size
      ? await getChatMediaAsset(storageKey, {
          start: range.start,
          end: range.end
        })
      : baseAsset;

  if (!asset) {
    return false;
  }

  const mimeType = asset.mimeType || options.mimeType || "audio/mp4";
  const fileName = asset.originalFileName || options.fileName || "voice-note";

  res.setHeader("Content-Type", mimeType);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(fileName)}"`
  );

  if (range && size) {
    res.status(206);
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader("Content-Length", String(range.end - range.start + 1));
  } else if (size) {
    res.setHeader("Content-Length", String(size));
  }

  asset.stream.on("error", () => {
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        message: "No fue posible reproducir el audio"
      });
      return;
    }

    res.end();
  });

  asset.stream.pipe(res);
  return true;
}

module.exports = {
  deleteChatMediaAsset,
  getChatMediaAsset,
  streamChatMediaAsset,
  uploadChatAudioAsset,
  uploadChatMediaAsset
};
