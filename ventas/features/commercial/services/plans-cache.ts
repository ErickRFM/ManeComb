import type { CommercialPlan } from '@/src/types/app';

/**
 * Cache local del catalogo de planes para mitigar el cold start del backend.
 * Estrategia stale-while-revalidate: mostramos el ultimo catalogo conocido de
 * inmediato y refrescamos en segundo plano. Solo afecta la percepcion de carga;
 * los datos siempre se revalidan contra la API.
 */
const PLANS_CACHE_KEY = 'manecomb-ventas-plans-cache';

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function readCachedPlans(): CommercialPlan[] {
  if (!canUseStorage()) return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(PLANS_CACHE_KEY) || 'null') as
      | { plans?: CommercialPlan[] }
      | null;
    const plans = parsed?.plans;
    return Array.isArray(plans) && plans.length ? plans : [];
  } catch {
    return [];
  }
}

export function writeCachedPlans(plans: CommercialPlan[]) {
  if (!canUseStorage() || !Array.isArray(plans) || !plans.length) return;

  try {
    window.localStorage.setItem(PLANS_CACHE_KEY, JSON.stringify({ plans, cachedAt: Date.now() }));
  } catch {
    // almacenamiento lleno o bloqueado: ignoramos, el cache es best-effort.
  }
}
