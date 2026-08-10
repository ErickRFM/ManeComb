import type { AuthIdentity } from './auth.types';
export { getFirstParam } from '../shared/utils';

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

export function validateRegistrationPassword(password: string) {
  const safePassword = String(password || '').trim();
  const hasLetter = /[A-Za-z]/.test(safePassword);
  const hasNumber = /\d/.test(safePassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(safePassword);

  if (safePassword.length < 8) {
    return 'La contraseña debe tener al menos 8 caracteres.';
  }

  if (!hasLetter || !hasNumber || !hasSpecial) {
    return 'La contraseña debe incluir letras, números y al menos un carácter especial.';
  }

  return null;
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
