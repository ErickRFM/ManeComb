const CHECKOUT_CONTEXT_KEY = 'manecomb-ventas-checkout-context';
const CHECKOUT_CONTEXT_VERSION = 3;
export const TRIAL_PLAN_ID = 'starter-2';

type CheckoutAttemptState = 'active' | 'redirected';

export type CheckoutContext = {
  planId: string;
  requestTrial: boolean;
  updatedAt: number;
  version?: number;
  intentFingerprint?: string;
  idempotencyKey?: string;
  attemptState?: CheckoutAttemptState;
};

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function isTrialPlanId(planId: string | null | undefined) {
  return String(planId || '').trim().toLowerCase() === TRIAL_PLAN_ID;
}

export function normalizeTrialIntent(planId: string | null | undefined, requestTrial = false) {
  return Boolean(requestTrial && isTrialPlanId(planId));
}

export function saveCheckoutContext(planId: string, requestTrial = false) {
  const cleanPlanId = String(planId || '').trim();
  if (!cleanPlanId || !canUseStorage()) return;

  const safeRequestTrial = normalizeTrialIntent(cleanPlanId, requestTrial);
  const current = readCheckoutContext();
  const preserveIntent = current?.planId === cleanPlanId && current.requestTrial === safeRequestTrial;
  const context: CheckoutContext = {
    planId: cleanPlanId,
    requestTrial: safeRequestTrial,
    updatedAt: Date.now(),
    version: CHECKOUT_CONTEXT_VERSION,
    ...(preserveIntent
      ? {
          intentFingerprint: current.intentFingerprint,
          idempotencyKey: current.idempotencyKey,
          attemptState: current.attemptState,
        }
      : {}),
  };

  window.localStorage.setItem(CHECKOUT_CONTEXT_KEY, JSON.stringify(context));
}

export function readCheckoutContext(): CheckoutContext | null {
  if (!canUseStorage()) return null;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(CHECKOUT_CONTEXT_KEY) || 'null') as CheckoutContext | null;
    if (!parsed?.planId) return null;

    const planId = String(parsed.planId);
    const idempotencyKey = parsed.idempotencyKey ? String(parsed.idempotencyKey) : undefined;
    const parsedAttemptState = parsed.attemptState === 'active' || parsed.attemptState === 'redirected'
      ? parsed.attemptState
      : undefined;

    return {
      planId,
      requestTrial: normalizeTrialIntent(planId, Boolean(parsed.requestTrial)),
      updatedAt: Number(parsed.updatedAt || Date.now()),
      version: Number(parsed.version || 1),
      intentFingerprint: parsed.intentFingerprint ? String(parsed.intentFingerprint) : undefined,
      idempotencyKey,
      attemptState: parsedAttemptState || (idempotencyKey ? 'redirected' : undefined),
    };
  } catch {
    return null;
  }
}

function createOpaqueCheckoutKey() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== 'function') throw new Error('No hay un generador seguro disponible para iniciar el checkout.');
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getOrCreateCheckoutIdempotencyKey(input: {
  userId: string;
  planId: string;
  paymentMethod: string;
  requestTrial: boolean;
  selectedAddOns: string[];
}) {
  const safeRequestTrial = normalizeTrialIntent(input.planId, input.requestTrial);
  const requestedMethod = String(input.paymentMethod || '').trim().toLowerCase();
  const normalizedTrialMethod = safeRequestTrial && requestedMethod === 'card' ? 'card' : 'trial';
  const normalized = {
    userId: String(input.userId || '').trim(),
    planId: String(input.planId || '').trim().toLowerCase(),
    paymentMethod: safeRequestTrial ? normalizedTrialMethod : requestedMethod,
    requestTrial: safeRequestTrial,
    selectedAddOns: Array.from(new Set(input.selectedAddOns.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean))).sort(),
  };
  const intentFingerprint = JSON.stringify(normalized);
  const current = readCheckoutContext();

  if (current?.intentFingerprint === intentFingerprint && current.idempotencyKey && current.attemptState !== 'redirected') {
    return current.idempotencyKey;
  }

  const idempotencyKey = createOpaqueCheckoutKey();
  if (canUseStorage()) {
    window.localStorage.setItem(CHECKOUT_CONTEXT_KEY, JSON.stringify({
      planId: normalized.planId,
      requestTrial: normalized.requestTrial,
      updatedAt: Date.now(),
      version: CHECKOUT_CONTEXT_VERSION,
      intentFingerprint,
      idempotencyKey,
      attemptState: 'active',
    } satisfies CheckoutContext));
  }
  return idempotencyKey;
}

export function markCheckoutAttemptRedirected() {
  if (!canUseStorage()) return;
  const current = readCheckoutContext();
  if (!current?.idempotencyKey || !current.intentFingerprint) return;

  window.localStorage.setItem(CHECKOUT_CONTEXT_KEY, JSON.stringify({
    ...current,
    version: CHECKOUT_CONTEXT_VERSION,
    updatedAt: Date.now(),
    attemptState: 'redirected',
  } satisfies CheckoutContext));
}

export function beginNewCheckoutAttempt() {
  if (!canUseStorage()) return;
  const current = readCheckoutContext();
  if (!current) return;

  window.localStorage.setItem(CHECKOUT_CONTEXT_KEY, JSON.stringify({
    planId: current.planId,
    requestTrial: current.requestTrial,
    updatedAt: Date.now(),
    version: CHECKOUT_CONTEXT_VERSION,
  } satisfies CheckoutContext));
}

export function clearCheckoutContext() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(CHECKOUT_CONTEXT_KEY);
}

export function buildCheckoutParams(planId: string, requestTrial = false) {
  return {
    planId,
    trial: normalizeTrialIntent(planId, requestTrial) ? '1' : '0',
  };
}
