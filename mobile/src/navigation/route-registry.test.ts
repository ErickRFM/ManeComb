import type { User } from '@/src/types/app';
import { ENTERPRISE_CAPABILITY } from '@/src/utils/mobile-authority';
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

function legacyUser(role: User['role']) {
  // Sesión emitida antes del contrato de capabilities: el campo no existe.
  const legacy = user(role) as Partial<User>;
  delete legacy.capabilities;
  return legacy as User;
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

  it('resuelve Directorio con la misma autoridad que usa el store', () => {
    // El router no puede esconder una pantalla cuyo endpoint el store sí llama.
    // Sesión moderna: backend manda y no hay fallback.
    expect(canUserAccessRoute('/usuarios', user('admin', []))).toBe(false);
    expect(canUserAccessRoute('/usuarios', user('driver', [ENTERPRISE_CAPABILITY.analyticsView]))).toBe(true);

    // Sesión heredada sin el contrato: aplica la compatibilidad de
    // mobile-authority, la misma que autoriza GET /users.
    expect(canUserAccessRoute('/usuarios', legacyUser('owner'))).toBe(true);
    expect(canUserAccessRoute('/usuarios', legacyUser('admin'))).toBe(true);
    expect(canUserAccessRoute('/usuarios', legacyUser('supervisor'))).toBe(true);
    expect(canUserAccessRoute('/usuarios', legacyUser('dispatcher'))).toBe(false);
    expect(canUserAccessRoute('/usuarios', legacyUser('driver'))).toBe(false);
  });

  it('niega Control cuando la sesión no trae el contrato de capabilities', () => {
    // Control es administrativo: sin contrato explícito se niega en vez de
    // adivinar por rol. No existe tabla legada para esta superficie.
    expect(canUserAccessRoute('/checklist', legacyUser('owner'))).toBe(false);
    expect(canUserAccessRoute('/checklist', legacyUser('admin'))).toBe(false);
    expect(canUserAccessRoute('/checklist', legacyUser('dispatcher'))).toBe(false);
    expect(canUserAccessRoute('/checklist', legacyUser('driver'))).toBe(false);
  });

  it('mantiene al conductor fuera de Control aunque opere su propia jornada', () => {
    // El driver usa el mismo router de backend para su self-service, pero su
    // plano es Mapa. Control exige routes.manage.
    expect(canUserAccessRoute('/checklist', user('driver', []))).toBe(false);
    expect(canUserAccessRoute('/mapa', user('driver', []))).toBe(true);
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