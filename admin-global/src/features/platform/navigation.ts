import type { PlatformCapabilities, PlatformModuleKey } from './types';

export type AdminNavigationItem = {
  key: string;
  label: string;
  shortLabel: string;
  path: string;
  description: string;
  module?: PlatformModuleKey;
  phase: 'P1' | 'P2' | 'P3' | 'P4';
};

const NAVIGATION_ITEMS: AdminNavigationItem[] = [
  {
    key: 'overview',
    label: 'Resumen global',
    shortLabel: 'Resumen',
    path: '/admin/overview',
    description: 'Estado general de empresas, usuarios, unidades y órdenes.',
    phase: 'P1',
  },
  {
    key: 'companies',
    label: 'Empresas',
    shortLabel: 'Empresas',
    path: '/admin/companies',
    description: 'Consulta multiempresa y detalle global en modo lectura.',
    module: 'companies',
    phase: 'P2',
  },
  {
    key: 'commercial',
    label: 'Comercial',
    shortLabel: 'Comercial',
    path: '/admin/commercial',
    description: 'Órdenes, pagos, suscripciones y eventos comerciales.',
    module: 'commercial',
    phase: 'P3',
  },
  {
    key: 'system',
    label: 'Sistema',
    shortLabel: 'Sistema',
    path: '/admin/system',
    description: 'Readiness e integraciones sanitizadas de ManeComb.',
    module: 'system',
    phase: 'P3',
  },
  {
    key: 'audit',
    label: 'Auditoría',
    shortLabel: 'Auditoría',
    path: '/admin/audit',
    description: 'Actividad sensible del personal interno de plataforma.',
    module: 'audit',
    phase: 'P3',
  },
  {
    key: 'team',
    label: 'Personal interno',
    shortLabel: 'Personal',
    path: '/admin/team',
    description: 'Usuarios internos, roles, MFA y estado de cuenta.',
    module: 'users',
    phase: 'P4',
  },
  {
    key: 'sessions',
    label: 'Sesiones',
    shortLabel: 'Sesiones',
    path: '/admin/sessions',
    description: 'Consulta y revocación controlada de sesiones Platform.',
    module: 'sessions',
    phase: 'P4',
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
