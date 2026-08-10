export type PortalRouteLoadScope = 'account' | 'billing' | 'none' | 'overview';

export function getPortalRouteLoadScope(pathname: string): PortalRouteLoadScope;
