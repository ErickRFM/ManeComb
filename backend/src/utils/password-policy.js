const MIN_PASSWORD_LENGTH = 8;

function validatePasswordStrength(password) {
  const safePassword = String(password || "");
  const hasLetter = /\p{L}/u.test(safePassword);
  const hasNumber = /\p{N}/u.test(safePassword);
  const hasSpecial = /[\p{P}\p{S}]/u.test(safePassword);

  if (safePassword.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  }

  if (!hasLetter || !hasNumber || !hasSpecial) {
    return "La contraseña debe incluir letras, números y al menos un carácter especial";
  }

  return null;
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  validatePasswordStrength
};
