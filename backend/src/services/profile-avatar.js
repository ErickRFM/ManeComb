const MAX_PROFILE_AVATAR_BYTES = 768 * 1024;
const MAX_PROFILE_AVATAR_URL_LENGTH = 2048;
const ALLOWED_PROFILE_AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
]);

class ProfileAvatarError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProfileAvatarError";
    this.statusCode = 400;
    this.publicMessage = message;
  }
}

function normalizeProfileAvatar(value) {
  if (value === null || typeof value === "undefined" || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new ProfileAvatarError("La foto de perfil no tiene un formato valido");
  }

  const avatarUrl = value.trim();
  if (!avatarUrl) return null;

  if (/^(file|content|blob):/i.test(avatarUrl)) {
    throw new ProfileAvatarError("La foto seleccionada solo existe en este dispositivo. Vuelve a elegirla para guardarla correctamente.");
  }

  if (/^https?:\/\//i.test(avatarUrl)) {
    if (avatarUrl.length > MAX_PROFILE_AVATAR_URL_LENGTH) {
      throw new ProfileAvatarError("La URL de la foto de perfil es demasiado larga");
    }
    return avatarUrl;
  }

  const match = avatarUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new ProfileAvatarError("La foto de perfil no tiene un formato valido");
  }

  const mimeType = String(match[1] || "").trim().toLowerCase();
  if (!ALLOWED_PROFILE_AVATAR_MIME_TYPES.has(mimeType)) {
    throw new ProfileAvatarError("La foto debe ser JPG, PNG, WEBP, HEIC o HEIF");
  }

  const base64 = String(match[2] || "").replace(/\s+/g, "");
  if (!base64 || base64.length % 4 === 1) {
    throw new ProfileAvatarError("La foto de perfil esta danada o incompleta");
  }

  let sizeBytes = 0;
  try {
    sizeBytes = Buffer.from(base64, "base64").length;
  } catch {
    throw new ProfileAvatarError("La foto de perfil esta danada o incompleta");
  }

  if (!sizeBytes) {
    throw new ProfileAvatarError("La foto de perfil esta vacia");
  }

  if (sizeBytes > MAX_PROFILE_AVATAR_BYTES) {
    throw new ProfileAvatarError("La foto de perfil es demasiado pesada. Elige una imagen menor o vuelve a intentarlo.");
  }

  return `data:${mimeType};base64,${base64}`;
}

module.exports = {
  ALLOWED_PROFILE_AVATAR_MIME_TYPES,
  MAX_PROFILE_AVATAR_BYTES,
  ProfileAvatarError,
  normalizeProfileAvatar
};
