import type { Role } from '@/src/types/app';

export const DIRECTORY_ALLOWED_ROLES: Role[] = ['admin', 'supervisor'];
export const CONTROL_ALLOWED_ROLES: Role[] = ['owner', 'admin', 'supervisor'];

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

export type RouteDefinition = {
  module: ModuleKey;
  root: string;
  allowedRoles?: Role[];
};

const moduleRoutes: Record<string, RouteDefinition> = {
  '/mapa': { module: 'map', root: '/mapa' },
  '/incidencias': { module: 'incidents', root: '/incidencias' },
  '/usuarios': { module: 'users', root: '/usuarios', allowedRoles: DIRECTORY_ALLOWED_ROLES },
  '/chat': { module: 'chat', root: '/chat' },
  '/radio': { module: 'radio', root: '/radio' },
  '/checklist': { module: 'checklist', root: '/checklist', allowedRoles: CONTROL_ALLOWED_ROLES },
  '/perfil': { module: 'profile', root: '/perfil' },
  '/perfil-editar': { module: 'profile', root: '/perfil' },
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

export function canRoleAccessRoute(routeName: string, role: Role) {
  const definition = getRouteDefinition(routeName);
  return Boolean(definition && (!definition.allowedRoles || definition.allowedRoles.includes(role)));
}
