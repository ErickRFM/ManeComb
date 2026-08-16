import type { CommercialPlan } from '@/src/types/app';

/**
 * Cache local del catalogo de planes para mitigar el cold start del backend.
 * Estrategia stale-while-revalidate: mostramos el ultimo catalogo conocido de
 * inmediato y refrescamos en segundo plano. El cache tiene una vida acotada para
 * que una caida prolongada de la API no deje precios antiguos visibles de forma
 * indefinida.
 */
const PLANS_CACHE_KEY = 'manecomb-ventas-plans-cache';
export const PLANS_CACHE_TTL_MS = 30 * 60 * 1000;

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function readCachedPlans(): CommercialPlan[] {
  if (!canUseStorage()) return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(PLANS_CACHE_KEY) || 'null') as
      | { plans?: CommercialPlan[]; cachedAt?: number }
      | null;
    const plans = parsed?.plans;
    const cachedAt = Number(parsed?.cachedAt || 0);
    const cacheAgeMs = Date.now() - cachedAt;
    const cacheIsFresh = Number.isFinite(cacheAgeMs)
      && cachedAt > 0
      && cacheAgeMs >= 0
      && cacheAgeMs <= PLANS_CACHE_TTL_MS;

    if (!cacheIsFresh) {
      window.localStorage.removeItem(PLANS_CACHE_KEY);
      return [];
    }

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
