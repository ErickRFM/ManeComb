const CHECKOUT_CONTEXT_KEY = 'manecomb-ventas-checkout-context';
const CHECKOUT_CONTEXT_VERSION = 2;

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

export function saveCheckoutContext(planId: string, requestTrial = false) {
  const cleanPlanId = String(planId || '').trim();

  if (!cleanPlanId || !canUseStorage()) {
    return;
  }

  const current = readCheckoutContext();
  const preserveIntent = current?.planId === cleanPlanId && current.requestTrial === requestTrial;
  const context: CheckoutContext = {
    planId: cleanPlanId,
    requestTrial,
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
  if (!canUseStorage()) {
    return null;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(CHECKOUT_CONTEXT_KEY) || 'null') as
      | CheckoutContext
      | null;

    if (!parsed?.planId) {
      return null;
    }

    const idempotencyKey = parsed.idempotencyKey ? String(parsed.idempotencyKey) : undefined;
    const parsedAttemptState = parsed.attemptState === 'active' || parsed.attemptState === 'redirected'
      ? parsed.attemptState
      : undefined;

    return {
      planId: String(parsed.planId),
      requestTrial: Boolean(parsed.requestTrial),
      updatedAt: Number(parsed.updatedAt || Date.now()),
      version: Number(parsed.version || 1),
      intentFingerprint: parsed.intentFingerprint ? String(parsed.intentFingerprint) : undefined,
      idempotencyKey,
      // Contextos anteriores a v2 solo podían contener una llave después de
      // haber intentado crear el checkout. Se consideran entregados al proveedor
      // para que el siguiente clic explícito genere un intento nuevo.
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
  const normalized = {
    userId: String(input.userId || '').trim(),
    planId: String(input.planId || '').trim().toLowerCase(),
    paymentMethod: String(input.paymentMethod || '').trim().toLowerCase(),
    requestTrial: Boolean(input.requestTrial),
    selectedAddOns: Array.from(new Set(input.selectedAddOns.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean))).sort(),
  };
  const intentFingerprint = JSON.stringify(normalized);
  const current = readCheckoutContext();

  // Mientras el intento sigue activo, la misma intención conserva la llave:
  // esto protege doble clic, reintentos de transporte y concurrencia.
  if (
    current?.intentFingerprint === intentFingerprint
    && current.idempotencyKey
    && current.attemptState !== 'redirected'
  ) {
    return current.idempotencyKey;
  }

  // Una vez que el checkout fue entregado al proveedor, un nuevo clic del
  // operador representa un intento nuevo y debe obtener una llave distinta.
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
  if (!canUseStorage()) {
    return;
  }

  const current = readCheckoutContext();
  if (!current?.idempotencyKey || !current.intentFingerprint) {
    return;
  }

  window.localStorage.setItem(CHECKOUT_CONTEXT_KEY, JSON.stringify({
    ...current,
    version: CHECKOUT_CONTEXT_VERSION,
    updatedAt: Date.now(),
    attemptState: 'redirected',
  } satisfies CheckoutContext));
}

export function beginNewCheckoutAttempt() {
  if (!canUseStorage()) {
    return;
  }

  const current = readCheckoutContext();
  if (!current) {
    return;
  }

  window.localStorage.setItem(CHECKOUT_CONTEXT_KEY, JSON.stringify({
    planId: current.planId,
    requestTrial: current.requestTrial,
    updatedAt: Date.now(),
    version: CHECKOUT_CONTEXT_VERSION,
  } satisfies CheckoutContext));
}

export function clearCheckoutContext() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(CHECKOUT_CONTEXT_KEY);
}

export function buildCheckoutParams(planId: string, requestTrial = false) {
  return {
    planId,
    trial: requestTrial ? '1' : '0',
  };
}
