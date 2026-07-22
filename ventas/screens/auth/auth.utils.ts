import type { AuthIdentity } from './auth.types';

export function getFirstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

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
