import type { PortalSubscription } from '@/src/types/app';
import type { PortalNavSection, PortalRoutePath } from './portal-route-registry';

const BASE_ACCOUNT_ROUTES = new Set<PortalRoutePath>([
  '/portal/plan',
  '/portal/perfil',
]);

const PAYMENT_RECOVERY_STATUSES = new Set([
  'pending',
  'pending_payment',
  'payment_pending',
  'failed',
  'payment_failed',
  'past_due',
]);

function normalizeStatus(subscription?: PortalSubscription | null) {
  return String(subscription?.status || '').trim().toLowerCase();
}

function normalizePortalPath(pathname: string): string {
  const clean = String(pathname || '').split('?')[0].replace(/\/+$/, '');
  return clean || '/portal';
}

export function hasOperationalPortalSubscription(
  subscription?: PortalSubscription | null
) {
  return subscription?.isActive === true;
}

export function needsPaymentRecovery(subscription?: PortalSubscription | null) {
  return PAYMENT_RECOVERY_STATUSES.has(normalizeStatus(subscription));
}

export function isPortalRouteAllowedBySubscription(
  pathname: string,
  subscription: PortalSubscription | null,
  authorityReady: boolean
) {
  if (!authorityReady || hasOperationalPortalSubscription(subscription)) return true;

  const path = normalizePortalPath(pathname);
  if (BASE_ACCOUNT_ROUTES.has(path as PortalRoutePath)) return true;
  if (path === '/portal/pagos' && needsPaymentRecovery(subscription)) return true;

  return false;
}

function relabelEntryItem<T extends PortalNavSection['items'][number]>(item: T): T {
  if (item.href !== '/portal/plan') return item;
  return { ...item, label: 'Elegir plan' } as T;
}

export function getPortalNavSectionsBySubscription(
  sections: PortalNavSection[],
  subscription: PortalSubscription | null,
  authorityReady: boolean
): PortalNavSection[] {
  if (hasOperationalPortalSubscription(subscription)) return sections;

  // Mientras overview todavía no responde, el menú falla cerrado: nunca enseña
  // operación por un instante y después la retira. Al llegar la autoridad real,
  // una suscripción activa recupera el menú completo automáticamente.
  const allowPaymentRecovery = authorityReady && needsPaymentRecovery(subscription);

  return sections
    .map((section) => ({
      ...section,
      items: section.items
        .filter((item) =>
          BASE_ACCOUNT_ROUTES.has(item.href)
          || (item.href === '/portal/pagos' && allowPaymentRecovery)
        )
        .map(relabelEntryItem),
    }))
    .filter((section) => section.items.length > 0);
}
