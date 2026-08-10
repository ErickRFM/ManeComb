import type { Role, User } from '@/src/types/app';
import { canLoadMobileDirectory, canUseMobileControl } from '@/src/utils/mobile-authority';

export const DRIVER_DOCUMENT_ALLOWED_ROLES: Role[] = ['driver'];

export const MODULE_ROUTE_NAMES = {
  map: '__module/map',
  incidents: '__module/incidents',
  users: '__module/users',
  chat: '__module/chat',
  radio: '__module/radio',
  checklist: '__module/checklist',
  profile: '__module/profile',
} as const;

export type ModuleKey = keyof typeof MODULE_ROUTE_NAMES;
export type ModuleRouteName = (typeof MODULE_ROUTE_NAMES)[ModuleKey];

/**
 * `authority` es una referencia a la decisión canónica que ya vive en
 * `mobile-authority.ts`. El registry no reconstruye reglas ni conoce
 * capabilities: solo declara qué autoridad gobierna cada ruta. Así la
 * compatibilidad con sesiones legadas existe en un único lugar y el router no
 * puede divergir de lo que el store considera permitido.
 */
export type RouteDefinition = {
  module: ModuleKey;
  root: string;
  allowedRoles?: Role[];
  authority?: (user: User) => boolean;
};

const moduleRoutes: Record<string, RouteDefinition> = {
  '/mapa': { module: 'map', root: '/mapa' },
  '/incidencias': { module: 'incidents', root: '/incidencias' },
  '/usuarios': {
    module: 'users',
    root: '/usuarios',
    authority: canLoadMobileDirectory,
  },
  '/chat': { module: 'chat', root: '/chat' },
  '/radio': { module: 'radio', root: '/radio' },
  '/checklist': {
    module: 'checklist',
    root: '/checklist',
    authority: canUseMobileControl,
  },
  '/perfil': { module: 'profile', root: '/perfil' },
  '/perfil-editar': { module: 'profile', root: '/perfil' },
  '/mis-documentos': { module: 'profile', root: '/perfil', allowedRoles: DRIVER_DOCUMENT_ALLOWED_ROLES },
};

export function getRouteDefinition(routeName: string | undefined | null) {
  return moduleRoutes[String(routeName || '')];
}

export function getModuleRouteName(module: ModuleKey) {
  return MODULE_ROUTE_NAMES[module];
}

export function isModuleRoot(routeName: string) {
  const definition = getRouteDefinition(routeName);
  return definition?.root === routeName;
}

export function canUserAccessRoute(routeName: string, user: User) {
  const definition = getRouteDefinition(routeName);
  if (!definition) return false;

  if (definition.authority) {
    return definition.authority(user);
  }

  return !definition.allowedRoles || definition.allowedRoles.includes(user.role);
}

// Kept only for genuinely role-scoped routes such as driver self-service.
// Rutas gobernadas por una autoridad deben pasar por canUserAccessRoute: un rol
// suelto no alcanza para decidirlas y responder aquí crearía un segundo sistema
// de autorización.
export function canRoleAccessRoute(routeName: string, role: Role) {
  const definition = getRouteDefinition(routeName);
  return Boolean(
    definition &&
    !definition.authority &&
    (!definition.allowedRoles || definition.allowedRoles.includes(role))
  );
}
