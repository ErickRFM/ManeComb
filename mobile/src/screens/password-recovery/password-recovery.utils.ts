export const PASSWORD_RECOVERY_RESEND_SECONDS = 45;
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_REQUIREMENTS = [
  { key: 'minLength', label: 'Al menos 8 caracteres' },
  { key: 'hasLetter', label: 'Una letra' },
  { key: 'hasNumber', label: 'Un número' },
  { key: 'hasSpecial', label: 'Un carácter especial' },
] as const;

export function normalizeRecoveryEmail(value: string) {
  return String(value || '').trim().toLowerCase();
}

export function isValidRecoveryEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeRecoveryEmail(value));
}

export function maskRecoveryEmail(value: string) {
  const [local = '', domain = ''] = normalizeRecoveryEmail(value).split('@');
  if (!local || !domain) return 'tu correo';
  return `${local.slice(0, 1)}***@${domain}`;
}

export function getPasswordChecks(password: string) {
  const safePassword = String(password || '');
  return {
    minLength: safePassword.length >= PASSWORD_MIN_LENGTH,
    hasLetter: /[A-Za-z]/.test(safePassword),
    hasNumber: /\d/.test(safePassword),
    hasSpecial: /[^A-Za-z0-9]/.test(safePassword),
  };
}

export function isPasswordAllowed(password: string) {
  return Object.values(getPasswordChecks(password)).every(Boolean);
}

export function normalizeRecoveryToken(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.length === 1 ? String(value[0] || '').trim() : '';
  }
  return String(value || '').trim();
}

export function parseAuthorizedRecoveryUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const isHttps = url.protocol === 'https:' && url.hostname === 'manecomb.com' && url.pathname === '/reset-password';
    const isCustomScheme = url.protocol === 'manecomb:' && url.hostname === 'reset-password' && (!url.pathname || url.pathname === '/');
    const tokens = url.searchParams.getAll('token').map((value) => value.trim()).filter(Boolean);
    const authorized = (isHttps || isCustomScheme) && tokens.length === 1;
    return authorized ? { authorized: true, token: tokens[0] } : { authorized: false, token: '' };
  } catch {
    return { authorized: false, token: '' };
  }
}

export function isRecoveryUrlCandidate(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';
    return normalizedPath === '/reset-password' || url.hostname === 'reset-password';
  } catch {
    return true;
  }
}
