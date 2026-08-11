import type { AuthIdentity } from './auth.types';
export { getFirstParam } from '../shared/utils';

export const REGISTRATION_PASSWORD_REQUIREMENTS = [
  {
    key: 'minLength',
    label: '8 caracteres o más',
    error: 'Usa al menos 8 caracteres.',
  },
  {
    key: 'hasLetter',
    label: 'Una letra (incluye ñ y acentos)',
    error: 'Agrega al menos una letra.',
  },
  {
    key: 'hasNumber',
    label: 'Un número',
    error: 'Agrega al menos un número.',
  },
  {
    key: 'hasSpecial',
    label: 'Un carácter especial, como ! @ # $ % _ -',
    error: 'Agrega al menos un carácter especial, por ejemplo !, @, # o _.',
  },
] as const;

export type RegistrationPasswordCheckKey = (typeof REGISTRATION_PASSWORD_REQUIREMENTS)[number]['key'];
export type RegistrationPasswordChecks = Record<RegistrationPasswordCheckKey, boolean>;

export function buildPaymentRoute(planId: string | undefined, requestTrial: boolean) {
  const params: Record<string, string> = {};

  if (planId) {
    params.planId = planId;
  }

  if (requestTrial) {
    params.trial = '1';
  }

  return Object.keys(params).length ? { pathname: '/ventas/pago', params } : '/portal';
}

export function getRegistrationPasswordChecks(password: string): RegistrationPasswordChecks {
  // Mantener esta política semánticamente equivalente a backend/src/utils/password-policy.js.
  // Unicode Letter/Number evita tratar ñ o vocales acentuadas como símbolos.
  // Punctuation/Symbol exige un carácter especial real; el espacio no cuenta como especial.
  const safePassword = String(password || '');
  return {
    minLength: safePassword.length >= 8,
    hasLetter: /\p{L}/u.test(safePassword),
    hasNumber: /\p{N}/u.test(safePassword),
    hasSpecial: /[\p{P}\p{S}]/u.test(safePassword),
  };
}

export function isRegistrationPasswordAllowed(password: string) {
  return Object.values(getRegistrationPasswordChecks(password)).every(Boolean);
}

export function validateRegistrationPassword(password: string) {
  const checks = getRegistrationPasswordChecks(password);
  const firstFailure = REGISTRATION_PASSWORD_REQUIREMENTS.find((requirement) => !checks[requirement.key]);
  return firstFailure?.error || null;
}

export function normalizeIdentity(rawValue: string): AuthIdentity {
  const value = rawValue.trim();
  const normalizedEmail = value.toLowerCase();

  if (normalizedEmail.includes('@')) {
    const displayName = normalizedEmail.split('@')[0]?.replace(/[._-]+/g, ' ').trim() || 'Usuario ManeComb';

    return {
      email: normalizedEmail,
      displayName,
    };
  }

  const digits = value.replace(/[^\d]/g, '');
  const phone = digits || value;

  return {
    email: `${phone || 'usuario'}@manecomb.local`.toLowerCase(),
    phone,
    displayName: phone ? `Usuario ${phone.slice(-4)}` : 'Usuario ManeComb',
  };
}
