jest.mock('@/src/config/api_config', () => ({
  readRuntimeValue: () => '',
}));

import {
  ENTERPRISE_CAPABILITY,
  canManageMobileUsers,
  canManageMobileVehicles,
} from '@/src/utils/mobile-authority';
import type { User } from '@/src/types/app';

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'directory-authority-user',
    name: 'ManeComb User',
    email: 'authority@manecomb.test',
    role: 'dispatcher',
    accountType: 'operations',
    phone: '',
    shift: '',
    status: 'offline',
    avatar: 'MC',
    vehicleId: null,
    ...overrides,
  } as User;
}

describe('Directorio mobile admin authority', () => {
  it('separa vehicles.manage de users.manage para dispatcher', () => {
    const dispatcher = user({
      capabilities: [
        ENTERPRISE_CAPABILITY.mobileAccess,
        ENTERPRISE_CAPABILITY.operationsUse,
        ENTERPRISE_CAPABILITY.vehiclesManage,
      ],
    });

    expect(canManageMobileVehicles(dispatcher)).toBe(true);
    expect(canManageMobileUsers(dispatcher)).toBe(false);
  });

  it('permite ambas autoridades solo cuando backend las serializa', () => {
    const admin = user({
      role: 'admin',
      capabilities: [
        ENTERPRISE_CAPABILITY.mobileAccess,
        ENTERPRISE_CAPABILITY.operationsUse,
        ENTERPRISE_CAPABILITY.usersManage,
        ENTERPRISE_CAPABILITY.vehiclesManage,
      ],
    });

    expect(canManageMobileVehicles(admin)).toBe(true);
    expect(canManageMobileUsers(admin)).toBe(true);
  });

  it('la pantalla exige users.manage para abrir o ejecutar una asignación', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, 'users-screen.tsx'), 'utf8');

    expect(source).toContain("if (!assignmentVehicle || !canManageUsers) return;");
    expect(source).toMatch(/\{canManageUsers \? \(\s*<ActionButton icon="account-switch-outline"/m);
  });
});
