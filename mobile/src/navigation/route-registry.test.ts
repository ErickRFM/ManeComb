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

  it('no expone Directorio a dispatcher hasta que el store consuma analytics.view', () => {
    expect(canRoleAccessRoute('/usuarios', 'owner')).toBe(true);
    expect(canRoleAccessRoute('/usuarios', 'admin')).toBe(true);
    expect(canRoleAccessRoute('/usuarios', 'dispatcher')).toBe(false);
    expect(canRoleAccessRoute('/usuarios', 'supervisor')).toBe(true);
    expect(canRoleAccessRoute('/usuarios', 'driver')).toBe(false);
  });

  it('alinea Control con los roles que backend autoriza a gestionar rutas', () => {
    expect(canRoleAccessRoute('/checklist', 'owner')).toBe(true);
    expect(canRoleAccessRoute('/checklist', 'admin')).toBe(true);
    expect(canRoleAccessRoute('/checklist', 'dispatcher')).toBe(true);
    expect(canRoleAccessRoute('/checklist', 'supervisor')).toBe(true);
    expect(canRoleAccessRoute('/checklist', 'driver')).toBe(false);
  });

  it('keeps profile editing inside the profile stack', () => {
    expect(getRouteDefinition('/perfil-editar')).toEqual({ module: 'profile', root: '/perfil' });
    expect(getRouteDefinition('/mis-documentos')).toEqual({ module: 'profile', root: '/perfil', allowedRoles: ['driver'] });
    expect(isModuleRoot('/perfil-editar')).toBe(false);
    expect(getModuleRouteName('profile')).toBe(MODULE_ROUTE_NAMES.profile);
  });

  it('reserva el self-service documental al conductor incluso por deep link', () => {
    expect(canRoleAccessRoute('/mis-documentos', 'driver')).toBe(true);
    expect(canRoleAccessRoute('/mis-documentos', 'dispatcher')).toBe(false);
    expect(canRoleAccessRoute('/mis-documentos', 'supervisor')).toBe(false);
    expect(canRoleAccessRoute('/mis-documentos', 'admin')).toBe(false);
  });

  it('does not classify public routes as operational modules', () => {
    expect(getRouteDefinition('/login')).toBeUndefined();
    expect(getRouteDefinition('/registro')).toBeUndefined();
  });
});