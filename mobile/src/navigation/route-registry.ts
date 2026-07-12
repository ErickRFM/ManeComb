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
};

const moduleRoutes: Record<string, RouteDefinition> = {
  '/mapa': { module: 'map', root: '/mapa' },
  '/incidencias': { module: 'incidents', root: '/incidencias' },
  '/usuarios': { module: 'users', root: '/usuarios' },
  '/chat': { module: 'chat', root: '/chat' },
  '/radio': { module: 'radio', root: '/radio' },
  '/checklist': { module: 'checklist', root: '/checklist' },
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

