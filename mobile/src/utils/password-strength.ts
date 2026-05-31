export const PASSWORD_MIN_LENGTH = 8;

export type PasswordStrengthTone = 'danger' | 'warning' | 'info' | 'positive';

export type PasswordStrengthResult = {
  score: number;
  label: string;
  tone: PasswordStrengthTone;
  checks: {
    minLength: boolean;
    hasLetter: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
};

export function getPasswordStrength(password: string): PasswordStrengthResult {
  const safePassword = String(password || '');
  const checks = {
    minLength: safePassword.length >= PASSWORD_MIN_LENGTH,
    hasLetter: /[A-Za-z]/.test(safePassword),
    hasNumber: /\d/.test(safePassword),
    hasSpecial: /[^A-Za-z0-9]/.test(safePassword),
  };
  const score = Object.values(checks).filter(Boolean).length;

  if (!safePassword) {
    return {
      score: 0,
      label: 'Sin capturar',
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
  return checks.minLength && checks.hasLetter && checks.hasNumber && checks.hasSpecial;
}
