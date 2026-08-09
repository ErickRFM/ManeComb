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
  '/portal/onboarding': { title: 'Activación' },
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
    title: 'Cuenta',
    items: [
      navItem('/portal', 'Operaciones', 'view-dashboard-outline'),
      navItem('/portal/plan', 'Mi plan', 'clipboard-list-outline'),
      navItem('/portal/facturacion', 'Facturación', 'file-document-outline'),
      navItem('/portal/pagos', 'Pagos', 'credit-card-outline'),
    ],
  },
  {
    title: 'Administración',
    items: [
      navItem('/portal/perfil', 'Empresa', 'domain', 'empresa', 'users'),
      navItem('/portal/usuarios', 'Equipo', 'account-key-outline', 'administracion'),
      navItem('/portal/unidades', 'Unidades', 'bus-multiple'),
      navItem('/portal/rutas', 'Rutas', 'routes'),
      navItem('/portal/perfil', 'Seguridad', 'shield-lock-outline', 'seguridad'),
      navItem('/portal/documentos', 'Documentos', 'file-document-multiple-outline'),
      navItem('/portal/incidencias', 'Incidencias', 'alert-circle-outline'),
    ],
  },
  {
    title: 'Ayuda',
    items: [
      navItem('/portal/onboarding', 'Activación', 'flag-checkered'),
      navItem('/portal/app-movil', 'App Móvil', 'cellphone-arrow-down'),
      navItem('/portal/perfil', 'Soporte', 'lifebuoy', 'soporte'),
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
