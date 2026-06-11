const CHECKOUT_CONTEXT_KEY = 'manecomb-ventas-checkout-context';

export type CheckoutContext = {
  planId: string;
  requestTrial: boolean;
  updatedAt: number;
};

let nativeCheckoutContext: CheckoutContext | null = null;

function getWebStorage() {
  return typeof window !== 'undefined' ? window.localStorage : null;
}

export function saveCheckoutContext(planId: string, requestTrial = false) {
  const cleanPlanId = String(planId || '').trim();

  if (!cleanPlanId) {
    return;
  }

  const context: CheckoutContext = {
    planId: cleanPlanId,
    requestTrial,
    updatedAt: Date.now(),
  };

  const storage = getWebStorage();

  if (storage) {
    storage.setItem(CHECKOUT_CONTEXT_KEY, JSON.stringify(context));
    return;
  }

  nativeCheckoutContext = context;
}

export function readCheckoutContext(): CheckoutContext | null {
  const storage = getWebStorage();

  if (!storage) {
    return nativeCheckoutContext;
  }

  try {
    const parsed = JSON.parse(storage.getItem(CHECKOUT_CONTEXT_KEY) || 'null') as
      | CheckoutContext
      | null;

    if (!parsed?.planId) {
      return null;
    }

    return {
      planId: String(parsed.planId),
      requestTrial: Boolean(parsed.requestTrial),
      updatedAt: Number(parsed.updatedAt || Date.now()),
    };
  } catch {
    return null;
  }
}

export function clearCheckoutContext() {
  const storage = getWebStorage();

  if (storage) {
    storage.removeItem(CHECKOUT_CONTEXT_KEY);
  }

  nativeCheckoutContext = null;
}

export function buildCheckoutParams(planId: string, requestTrial = false) {
  return {
    planId,
    trial: requestTrial ? '1' : '0',
  };
}
