const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 64;

const COMMON_PASSWORD_FINGERPRINTS = new Set([
  "password1",
  "password123",
  "qwerty123",
  "admin123",
  "admin1234",
  "manecomb123",
  "manecomb1234",
  "combis123",
  "combis1234",
  "welcome123",
  "bienvenido123",
  "changeme123"
]);

function getPasswordFingerprint(password) {
  return String(password || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function validatePasswordStrength(password) {
  const safePassword = String(password || "").normalize("NFKC");
  const hasLetter = /\p{L}/u.test(safePassword);
  const hasNumber = /\p{N}/u.test(safePassword);
  const hasSpecial = /[\p{P}\p{S}]/u.test(safePassword);

  if (safePassword.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  }

  // bcrypt solo procesa de forma segura una cantidad acotada de bytes. Mantener
  // este límite evita contraseñas visualmente distintas que terminen truncadas
  // al mismo prefijo antes de ser hasheadas.
  if (Buffer.byteLength(safePassword, "utf8") > MAX_PASSWORD_BYTES) {
    return `La contraseña no debe superar ${MAX_PASSWORD_BYTES} bytes`;
  }

  if (!hasLetter || !hasNumber || !hasSpecial) {
    return "La contraseña debe incluir letras, números y al menos un carácter especial";
  }

  const fingerprint = getPasswordFingerprint(safePassword);
  if (COMMON_PASSWORD_FINGERPRINTS.has(fingerprint)) {
    return "La contraseña es demasiado común. Usa una clave única para ManeComb";
  }

  if (/^(.)\1{7,}$/u.test(safePassword)) {
    return "La contraseña es demasiado predecible. Usa una clave única para ManeComb";
  }

  return null;
}

module.exports = {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  getPasswordFingerprint,
  validatePasswordStrength
};
