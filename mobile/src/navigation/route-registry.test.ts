import type { User } from '@/src/types/app';
import { ENTERPRISE_CAPABILITY } from '@/src/store/mobile-capability-authority';
import {
  canRoleAccessRoute,
  canUserAccessRoute,
  getModuleRouteName,
  getRouteDefinition,
  isModuleRoot,
  MODULE_ROUTE_NAMES,
} from './route-registry';

function user(role: User['role'], capabilities: string[] = []) {
  return {
    id: `user-${role}`,
    name: role,
    email: `${role}@manecomb.test`,
    role,
    accountType: 'operations',
    phone: '',
    shift: '',
    status: 'online',
    avatar: role.slice(0, 1).toUpperCase(),
    vehicleId: null,
    capabilities,
  } as User;
}

describe('navigation route registry', () => {
  it('keeps every operational root in an independent module', () => {
    const roots = ['/mapa', '/incidencias', '/usuarios', '/chat', '/radio', '/checklist', '/perfil'];
    const modules = roots.map((route) => getRouteDefinition(route)?.module);

    expect(new Set(modules).size).toBe(roots.length);
    expect(roots.every(isModuleRoot)).toBe(true);
  });

  it('gates Directorio with analytics.view instead of role tables', () => {
    expect(canUserAccessRoute('/usuarios', user('dispatcher', [ENTERPRISE_CAPABILITY.analyticsView]))).toBe(true);
    expect(canUserAccessRoute('/usuarios', user('supervisor', [ENTERPRISE_CAPABILITY.analyticsView]))).toBe(true);
    expect(canUserAccessRoute('/usuarios', user('admin', []))).toBe(false);
    expect(canUserAccessRoute('/usuarios', user('driver', []))).toBe(false);
    expect(canRoleAccessRoute('/usuarios', 'admin')).toBe(false);
  });

  it('gates Control with routes.manage instead of a duplicated role matrix', () => {
    expect(canUserAccessRoute('/checklist', user('owner', [ENTERPRISE_CAPABILITY.routesManage]))).toBe(true);
    expect(canUserAccessRoute('/checklist', user('dispatcher', [ENTERPRISE_CAPABILITY.routesManage]))).toBe(true);
    expect(canUserAccessRoute('/checklist', user('supervisor', [ENTERPRISE_CAPABILITY.routesManage]))).toBe(true);
    expect(canUserAccessRoute('/checklist', user('driver', []))).toBe(false);
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
    expect(canUserAccessRoute('/mis-documentos', user('driver'))).toBe(true);
  });

  it('does not classify public routes as operational modules', () => {
    expect(getRouteDefinition('/login')).toBeUndefined();
    expect(getRouteDefinition('/registro')).toBeUndefined();
  });
});