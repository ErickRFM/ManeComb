import { isStrongPassword, PASSWORD_MIN_LENGTH } from '@/src/utils/password-strength';

export type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function validatePasswordChangeInput(payload: ChangePasswordPayload) {
  const currentPassword = payload.currentPassword;
  const newPassword = payload.newPassword.trim();
  const confirmPassword = payload.confirmPassword.trim();

  if (!currentPassword || !newPassword || !confirmPassword) {
    return 'Completa tu contraseña actual, la nueva y la confirmación.';
  }
  if (!isStrongPassword(newPassword)) {
    return `La nueva contraseña debe tener mínimo ${PASSWORD_MIN_LENGTH} caracteres, letras, números y un carácter especial.`;
  }
  if (newPassword !== confirmPassword) {
    return 'La confirmación no coincide con la nueva contraseña.';
  }
  if (currentPassword === newPassword) {
    return 'La nueva contraseña debe ser diferente de la actual.';
  }
  return null;
}
