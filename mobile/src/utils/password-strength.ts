export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

const COMMON_PASSWORD_FINGERPRINTS = new Set([
  'password1',
  'password123',
  'qwerty123',
  'admin123',
  'admin1234',
  'manecomb123',
  'manecomb1234',
  'combis123',
  'combis1234',
  'welcome123',
  'bienvenido123',
  'changeme123',
]);

export type PasswordStrengthTone = 'danger' | 'warning' | 'info' | 'positive';

export type PasswordStrengthResult = {
  score: number;
  label: string;
  tone: PasswordStrengthTone;
  checks: {
    minLength: boolean;
    withinMaxLength: boolean;
    hasLetter: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
    notCommon: boolean;
  };
};

function getPasswordFingerprint(password: string) {
  return String(password || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function getPasswordStrength(password: string): PasswordStrengthResult {
  const safePassword = String(password || '').normalize('NFKC');
  const checks = {
    minLength: safePassword.length >= PASSWORD_MIN_LENGTH,
    withinMaxLength: safePassword.length <= PASSWORD_MAX_LENGTH,
    hasLetter: /\p{L}/u.test(safePassword),
    hasNumber: /\p{N}/u.test(safePassword),
    hasSpecial: /[\p{P}\p{S}]/u.test(safePassword),
    notCommon: !COMMON_PASSWORD_FINGERPRINTS.has(getPasswordFingerprint(safePassword)),
  };
  const score = [checks.minLength, checks.hasLetter, checks.hasNumber, checks.hasSpecial].filter(Boolean).length;

  if (!safePassword) {
    return {
      score: 0,
      label: 'Sin capturar',
      tone: 'danger',
      checks,
    };
  }

  if (!checks.withinMaxLength || !checks.notCommon) {
    return {
      score,
      label: 'No segura',
      tone: 'danger',
      checks,
    };
  }

  if (score <= 2) {
    return {
      score,
      label: 'Débil',
      tone: 'danger',
      checks,
    };
  }

  if (score === 3) {
    return {
      score,
      label: 'Media',
      tone: 'warning',
      checks,
    };
  }

  return {
    score,
    label: 'Fuerte',
    tone: 'positive',
    checks,
  };
}

export function isStrongPassword(password: string) {
  const { checks } = getPasswordStrength(password);
  return checks.minLength && checks.withinMaxLength && checks.hasLetter && checks.hasNumber && checks.hasSpecial && checks.notCommon;
}
