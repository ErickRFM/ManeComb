import type { CheckoutContext } from '@/src/utils/checkout-context';
import {
  getRegistrationPasswordChecks,
  isRegistrationPasswordAllowed,
} from '@/screens/auth/auth.utils';

export const PASSWORD_RECOVERY_RESEND_SECONDS = 45;

export type RecoveryCheckoutContext = {
  planId?: string;
  requestTrial: boolean;
};

export function normalizeRecoveryEmail(value: string) {
  return String(value || '').trim().toLowerCase();
}

export function isValidRecoveryEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeRecoveryEmail(value));
}

export function maskRecoveryEmail(value: string) {
  const [local = '', domain = ''] = normalizeRecoveryEmail(value).split('@');
  return local && domain ? `${local.slice(0, 1)}***@${domain}` : 'tu correo';
}

export function getPasswordChecks(password: string) {
  return getRegistrationPasswordChecks(password);
}

export function isPasswordAllowed(password: string) {
  return isRegistrationPasswordAllowed(password);
}

export function normalizeRecoveryToken(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.length === 1 ? String(value[0] || '').trim() : '';
  return String(value || '').trim();
}

export function resolveRecoveryCheckoutContext(
  planParam: string | string[] | undefined,
  trialParam: string | string[] | undefined,
  stored: CheckoutContext | null
): RecoveryCheckoutContext {
  const planId = normalizeRecoveryToken(planParam) || stored?.planId;
  const trial = normalizeRecoveryToken(trialParam);
  return {
    planId,
    requestTrial: trial ? trial === '1' : Boolean(stored?.requestTrial && stored.planId === planId),
  };
}

export function buildRecoveryRoute(pathname: string, context: RecoveryCheckoutContext) {
  return {
    pathname,
    params: {
      ...(context.planId ? { planId: context.planId } : {}),
      ...(context.planId ? { trial: context.requestTrial ? '1' : '0' } : {}),
    },
  };
}

export function getRecoveryError(error: unknown, action: 'request' | 'reset') {
  const candidate = error as { code?: string; message?: string; response?: { status?: number; data?: { message?: string } } };
  const status = candidate?.response?.status;
  const apiMessage = String(candidate?.response?.data?.message || '');
  const technicalMessage = String(candidate?.message || '');
  if (status === 429) return 'Realizaste varios intentos. Espera antes de volver a intentarlo.';
  if (!candidate?.response && /timeout|timed out|ECONNABORTED/i.test(`${candidate?.code} ${technicalMessage}`)) {
    return 'ManeComb está tardando en responder. La solicitud no se reenviará sola; inténtalo nuevamente.';
  }
  if (!candidate?.response) return 'No hay conexión con ManeComb. Revisa internet e inténtalo nuevamente.';
  if (action === 'reset' && /expirado|invalido|inválido/i.test(apiMessage)) return 'El enlace es inválido o venció. Solicita uno nuevo.';
  if (action === 'reset' && /contrase/i.test(apiMessage)) return apiMessage;
  return action === 'request'
    ? 'No fue posible procesar la solicitud. Inténtalo nuevamente.'
    : 'No fue posible guardar la nueva contraseña. Inténtalo nuevamente.';
}
