import { expect, test } from '@playwright/test';
import { canAccessPortal, hasPortalPermission } from '../../../ventas/features/portal/utils/access';

const { getCapabilitiesForUser } = require('../../../backend/src/services/enterprise-capabilities.js') as {
  getCapabilitiesForUser: (user: {
    accountChannel: string;
    accountType: string;
    role: string;
  }) => string[];
};

type ContractUser = {
  accountChannel: string;
  accountType: string;
  role: string;
  capabilities: string[];
};

function canonicalUser(input: Omit<ContractUser, 'capabilities'>): ContractUser {
  return {
    ...input,
    capabilities: getCapabilitiesForUser(input),
  };
}

test.describe('Backend → Portal capability authority', () => {
  test('company owner receives portal and mobile product authority from backend', () => {
    const user = canonicalUser({
      accountChannel: 'company_portal',
      accountType: 'company_owner',
      role: 'owner',
    });

    expect(user.capabilities).toContain('portal.access');
    expect(user.capabilities).toContain('mobile.access');
    expect(canAccessPortal(user)).toBe(true);
    expect(hasPortalPermission(user, 'routes')).toBe(true);
    expect(hasPortalPermission(user, 'documents')).toBe(true);
  });

  test('mobile driver cannot enter Portal even though the role is operationally valid', () => {
    const user = canonicalUser({
      accountChannel: 'mobile_operations',
      accountType: 'operations',
      role: 'driver',
    });

    expect(user.capabilities).toContain('mobile.access');
    expect(user.capabilities).not.toContain('portal.access');
    expect(canAccessPortal(user)).toBe(false);
    expect(hasPortalPermission(user, 'routes')).toBe(false);
  });

  test('portal viewer can enter Portal but cannot inherit route management from the channel', () => {
    const user = canonicalUser({
      accountChannel: 'company_portal',
      accountType: 'company_owner',
      role: 'viewer',
    });

    expect(canAccessPortal(user)).toBe(true);
    expect(hasPortalPermission(user, 'analytics')).toBe(true);
    expect(hasPortalPermission(user, 'routes')).toBe(false);
    expect(hasPortalPermission(user, 'vehicles')).toBe(false);
  });

  test('explicit modern capabilities fail closed instead of falling back to accountChannel', () => {
    const user: ContractUser = {
      accountChannel: 'company_portal',
      accountType: 'company_owner',
      role: 'owner',
      capabilities: [],
    };

    expect(canAccessPortal(user)).toBe(false);
    expect(hasPortalPermission(user, 'routes')).toBe(false);
  });
});
