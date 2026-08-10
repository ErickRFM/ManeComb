const ROUTE_LOAD_SCOPE = Object.freeze({
  '/portal/facturacion': 'billing',
  '/portal/onboarding': 'overview',
  '/portal/pagos': 'overview',
  '/portal/perfil': 'account',
  '/portal/plan': 'overview',
});

export function getPortalRouteLoadScope(pathname) {
  return ROUTE_LOAD_SCOPE[pathname] || 'none';
}
