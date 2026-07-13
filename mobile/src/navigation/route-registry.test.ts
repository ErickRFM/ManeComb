import {
  canRoleAccessRoute,
  getModuleRouteName,
  getRouteDefinition,
  isModuleRoot,
  MODULE_ROUTE_NAMES,
} from './route-registry';

describe('navigation route registry', () => {
  it('keeps every operational root in an independent module', () => {
    const roots = ['/mapa', '/incidencias', '/usuarios', '/chat', '/radio', '/checklist', '/perfil'];
    const modules = roots.map((route) => getRouteDefinition(route)?.module);

    expect(new Set(modules).size).toBe(roots.length);
    expect(roots.every(isModuleRoot)).toBe(true);
  });

  it('restringe el directorio operativo a administradores y supervisores', () => {
    expect(canRoleAccessRoute('/usuarios', 'admin')).toBe(true);
    expect(canRoleAccessRoute('/usuarios', 'supervisor')).toBe(true);
    expect(canRoleAccessRoute('/usuarios', 'driver')).toBe(false);
    expect(canRoleAccessRoute('/usuarios', 'owner')).toBe(false);
  });

  it('keeps profile editing inside the profile stack', () => {
    expect(getRouteDefinition('/perfil-editar')).toEqual({ module: 'profile', root: '/perfil' });
    expect(isModuleRoot('/perfil-editar')).toBe(false);
    expect(getModuleRouteName('profile')).toBe(MODULE_ROUTE_NAMES.profile);
  });

  it('does not classify public routes as operational modules', () => {
    expect(getRouteDefinition('/login')).toBeUndefined();
    expect(getRouteDefinition('/registro')).toBeUndefined();
  });
});
