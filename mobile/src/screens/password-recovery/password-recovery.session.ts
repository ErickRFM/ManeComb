let recoveryEmail = '';

export function getRecoveryEmail() {
  return recoveryEmail;
}

export function setRecoveryEmail(email: string) {
  recoveryEmail = String(email || '').trim().toLowerCase();
}

export function clearRecoverySession() {
  recoveryEmail = '';
}
