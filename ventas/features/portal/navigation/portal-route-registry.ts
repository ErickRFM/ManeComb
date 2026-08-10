import type { PortalPermission } from '../utils/access';

export type PortalRouteDefinition = {
  title: string;
  permission?: PortalPermission;
};

export const PORTAL_ROUTE_REGISTRY = {
  '/portal': { title: 'Operaciones' },
  '/portal/usuarios': { title: 'Equipo', permission: 'users' },
  '/portal/unidades': { title: 'Unidades', permission: 'vehicles' },
  '/portal/rutas': { title: 'Rutas', permission: 'routes' },
  '/portal/plan': { title: 'Mi plan', permission: 'billing' },
  '/portal/facturacion': { title: 'Facturación', permission: 'billing' },
  '/portal/pagos': { title: 'Pagos', permission: 'billing' },
  '/portal/perfil': { title: 'Perfil' },
  '/portal/onboarding': { title: 'Activación', permission: 'users' },
  '/portal/documentos': { title: 'Documentos', permission: 'documents' },
  '/portal/incidencias': { title: 'Incidencias', permission: 'incidents' },
  '/portal/app-movil': { title: 'App Móvil' },
} as const satisfies Record<string, PortalRouteDefinition>;

export type PortalRoutePath = keyof typeof PORTAL_ROUTE_REGISTRY;

export type PortalNavItem = {
  label: string;
  href: PortalRoutePath;
  icon: string;
  section?: string;
  permission?: PortalPermission;
};

export type PortalNavSection = {
  title: string;
  items: PortalNavItem[];
};

function getRouteDefinition(href: PortalRoutePath): PortalRouteDefinition {
  return PORTAL_ROUTE_REGISTRY[href] as PortalRouteDefinition;
}

function navItem(
  href: PortalRoutePath,
  label: string,
  icon: string,
  section?: string,
  permission?: PortalPermission,
): PortalNavItem {
  return {
    label,
    href,
    icon,
    section,
    permission: permission ?? getRouteDefinition(href).permission,
  };
}

export const PORTAL_NAV_SECTIONS: PortalNavSection[] = [
  {
    title: 'Operación',
    items: [
      navItem('/portal', 'Inicio', 'view-dashboard-outline'),
      navItem('/portal/rutas', 'Rutas', 'routes'),
      navItem('/portal/incidencias', 'Incidencias', 'alert-circle-outline'),
    ],
  },
  {
    title: 'Gestión',
    items: [
      navItem('/portal/usuarios', 'Equipo', 'account-key-outline', 'administracion'),
      navItem('/portal/unidades', 'Unidades', 'bus-multiple'),
      navItem('/portal/documentos', 'Documentos', 'file-document-multiple-outline'),
      navItem('/portal/onboarding', 'Activación', 'flag-checkered'),
    ],
  },
  {
    title: 'Suscripción',
    items: [
      navItem('/portal/plan', 'Mi plan', 'clipboard-list-outline'),
      navItem('/portal/pagos', 'Pagos', 'credit-card-outline'),
      navItem('/portal/facturacion', 'Facturación', 'file-document-outline'),
    ],
  },
  {
    title: 'Cuenta',
    items: [
      navItem('/portal/perfil', 'Cuenta y empresa', 'account-circle-outline'),
      navItem('/portal/app-movil', 'App Móvil', 'cellphone-arrow-down'),
    ],
  },
];

export function getPortalRouteDefinition(pathname: string): PortalRouteDefinition | null {
  const definition = PORTAL_ROUTE_REGISTRY[pathname as PortalRoutePath];
  return definition ? (definition as PortalRouteDefinition) : null;
}

export function getPortalRoutePermission(pathname: string): PortalPermission | undefined {
  return getPortalRouteDefinition(pathname)?.permission;
}
