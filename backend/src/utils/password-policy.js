const MIN_PASSWORD_LENGTH = 8;

function validatePasswordStrength(password) {
  const safePassword = String(password || "");
  const hasLetter = /[A-Za-z]/.test(safePassword);
  const hasNumber = /\d/.test(safePassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(safePassword);

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
