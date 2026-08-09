import type { User } from '@/src/types/app';
import { ENTERPRISE_CAPABILITY } from '@/src/store/mobile-capability-authority';
import { getAppSections } from './desktop-navigation';

function user(role: User['role'], capabilities: string[] = []) {
  return {
    id: `menu-${role}`,
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

function hasSection(currentUser: User, key: 'usuarios' | 'checklist') {
  return getAppSections(currentUser).some((section) => section.key === key);
}

describe('visibilidad capability-driven del menu operativo', () => {
  it('muestra Directorio a cualquier usuario con analytics.view', () => {
    expect(hasSection(user('dispatcher', [ENTERPRISE_CAPABILITY.analyticsView]), 'usuarios')).toBe(true);
    expect(hasSection(user('supervisor', [ENTERPRISE_CAPABILITY.analyticsView]), 'usuarios')).toBe(true);
    expect(hasSection(user('admin', []), 'usuarios')).toBe(false);
  });

  it('muestra Control solo con routes.manage', () => {
    expect(hasSection(user('owner', [ENTERPRISE_CAPABILITY.routesManage]), 'checklist')).toBe(true);
    expect(hasSection(user('dispatcher', [ENTERPRISE_CAPABILITY.routesManage]), 'checklist')).toBe(true);
    expect(hasSection(user('supervisor', [ENTERPRISE_CAPABILITY.routesManage]), 'checklist')).toBe(true);
    expect(hasSection(user('driver', []), 'checklist')).toBe(false);
  });
});