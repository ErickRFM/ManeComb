import type { PlatformCapabilities, PlatformModuleKey } from './types';

export type AdminNavigationItem = {
  key: string;
  label: string;
  shortLabel: string;
  path: string;
  description: string;
  module?: PlatformModuleKey;
};

const NAVIGATION_ITEMS: AdminNavigationItem[] = [
  {
    key: 'overview',
    label: 'Resumen global',
    shortLabel: 'Resumen',
    path: '/admin/overview',
    description: 'Estado general de empresas, usuarios, unidades y órdenes.',
  },
  {
    key: 'companies',
    label: 'Empresas',
    shortLabel: 'Empresas',
    path: '/admin/companies',
    description: 'Consulta multiempresa y detalle global en modo lectura.',
    module: 'companies',
  },
  {
    key: 'commercial',
    label: 'Comercial',
    shortLabel: 'Comercial',
    path: '/admin/commercial',
    description: 'Órdenes, pagos, suscripciones y eventos comerciales.',
    module: 'commercial',
  },
  {
    key: 'system',
    label: 'Sistema',
    shortLabel: 'Sistema',
    path: '/admin/system',
    description: 'Salud general e integraciones de ManeComb.',
    module: 'system',
  },
  {
    key: 'audit',
    label: 'Auditoría',
    shortLabel: 'Auditoría',
    path: '/admin/audit',
    description: 'Actividad sensible del personal interno de plataforma.',
    module: 'audit',
  },
  {
    key: 'team',
    label: 'Personal interno',
    shortLabel: 'Personal',
    path: '/admin/team',
    description: 'Usuarios internos, roles, MFA y estado de cuenta.',
    module: 'users',
  },
  {
    key: 'sessions',
    label: 'Sesiones',
    shortLabel: 'Sesiones',
    path: '/admin/sessions',
    description: 'Consulta y revocación controlada de sesiones.',
    module: 'sessions',
  },
];

export function getAdminNavigation(capabilities: PlatformCapabilities | null) {
  if (!capabilities) return NAVIGATION_ITEMS.filter((item) => !item.module);

  return NAVIGATION_ITEMS.filter((item) => {
    if (!item.module) return true;
    return Boolean(capabilities.modules[item.module]);
  });
}

export function findAdminNavigationItem(pathname: string) {
  return NAVIGATION_ITEMS.find((item) => item.path === pathname) || null;
}
