const CHECKOUT_CONTEXT_KEY = 'manecomb-ventas-checkout-context';

export type CheckoutContext = {
  planId: string;
  requestTrial: boolean;
  updatedAt: number;
};

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function saveCheckoutContext(planId: string, requestTrial = false) {
  const cleanPlanId = String(planId || '').trim();

  if (!cleanPlanId || !canUseStorage()) {
    return;
  }

  const context: CheckoutContext = {
    planId: cleanPlanId,
    requestTrial,
    updatedAt: Date.now(),
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
