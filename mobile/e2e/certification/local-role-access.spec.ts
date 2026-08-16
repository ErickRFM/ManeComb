import { expect, test, type Page } from '@playwright/test';
import {
  assertNoDocumentOverflow,
  attachFullPageScreenshot,
  attachRuntimeProbe,
} from './helpers';

type RoleIdentity = {
  role: 'owner' | 'admin' | 'billing_manager' | 'supervisor';
  accountType: 'company_owner' | 'operations';
  accountChannel: 'company_portal' | 'mobile_operations';
  capabilities: string[];
  canAccessPortal: boolean;
  canAccessMobile: boolean;
  canUseOperations: boolean;
  destination: string;
  productRoute: string;
};

const FULL_PORTAL_CAPABILITIES = [
  'portal.access',
  'mobile.access',
  'operations.use',
  'tenant.access',
  'users.manage',
  'billing.manage',
  'vehicles.manage',
  'analytics.view',
  'communication.rtc.access',
  'routes.manage',
  'documents.manage',
  'incidents.manage',
];

const identities: Record<RoleIdentity['role'], RoleIdentity> = {
  owner: {
    role: 'owner',
    accountType: 'company_owner',
    accountChannel: 'company_portal',
    capabilities: FULL_PORTAL_CAPABILITIES,
    canAccessPortal: true,
    canAccessMobile: true,
    canUseOperations: true,
    destination: 'CompanyPortal',
    productRoute: '/portal',
  },
  admin: {
    role: 'admin',
    accountType: 'company_owner',
    accountChannel: 'company_portal',
    capabilities: FULL_PORTAL_CAPABILITIES,
    canAccessPortal: true,
    canAccessMobile: true,
    canUseOperations: true,
    destination: 'CompanyPortal',
    productRoute: '/portal',
  },
  billing_manager: {
    role: 'billing_manager',
    accountType: 'company_owner',
    accountChannel: 'company_portal',
    capabilities: ['portal.access', 'operations.use', 'tenant.access', 'billing.manage', 'analytics.view'],
    canAccessPortal: true,
    canAccessMobile: false,
    canUseOperations: true,
    destination: 'CompanyPortal',
    productRoute: '/portal',
  },
  supervisor: {
    role: 'supervisor',
    accountType: 'operations',
    accountChannel: 'mobile_operations',
    capabilities: [
      'mobile.access',
      'operations.use',
      'tenant.access',
      'vehicles.manage',
      'analytics.view',
      'communication.rtc.access',
      'routes.manage',
      'documents.manage',
      'incidents.manage',
    ],
    canAccessPortal: false,
    canAccessMobile: true,
    canUseOperations: true,
    destination: 'HomeSupervisor',
    productRoute: '/mapa',
  },
};

const subscription = {
  id: 'subscription-role-certification',
  planId: 'starter-2',
  planName: '2 combis',
  status: 'active',
  isActive: true,
  activeUnits: 0,
  availableUnits: 2,
  totalUnits: 2,
  unitsLimit: 2,
  monthlyPrice: 149,
  currency: 'MXN',
};

const tenant = {
  id: 'tenant-role-certification',
  organizationId: 'tenant-role-certification',
  companyId: 'tenant-role-certification',
  name: 'Empresa Certificación Roles',
  status: 'active',
  isOperational: true,
};

function buildSession(identity: RoleIdentity) {
  const user = {
    id: `role-${identity.role}`,
    name: `Certificación ${identity.role}`,
    email: `${identity.role}@certification.manecomb.test`,
    role: identity.role,
    accountType: identity.accountType,
    accountChannel: identity.accountChannel,
    accountChannelReason: `${identity.accountChannel}_role_certification`,
    capabilities: identity.capabilities,
    organizationId: tenant.id,
    userStatus: 'active',
    phone: '',
    shift: '',
    status: 'online',
    avatar: 'MC',
    vehicleId: null,
  };

  const authContext = {
    accountChannel: identity.accountChannel,
    accountChannelReason: user.accountChannelReason,
    canAccessPortal: identity.canAccessPortal,
    canAccessMobile: identity.canAccessMobile,
    canUseOperations: identity.canUseOperations,
    destination: identity.destination,
    productDestination: identity.destination,
    route: identity.productRoute,
    productRoute: identity.productRoute,
    mobileBlockReason: identity.canAccessMobile ? null : 'wrong_channel',
    operationalBlockReason: identity.canUseOperations ? null : 'wrong_channel',
    subscription,
    tenant,
    onboarding: { status: 'completed', steps: [] },
  };

  return {
    ok: true,
    profile: { user, documents: [] },
    user,
    authContext,
    ...authContext,
    postLoginDestination: identity.destination,
    postLoginRoute: identity.productRoute,
  };
}

async function installRoleContract(page: Page, identity: RoleIdentity) {
  const session = buildSession(identity);

  await page.addInitScript(() => {
    window.localStorage.setItem('manecomb-ventas-token', 'local-role-certification-token');
    window.localStorage.setItem('manecomb-ventas-refresh-token', 'local-role-certification-refresh');
  });

  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (!pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }

    if (pathname.endsWith('/api/auth/session')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) });
      return;
    }

    if (pathname.endsWith('/api/portal/overview')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            organization: { id: tenant.id, name: tenant.name, fleetSize: 0, status: 'active' },
            account: session.user,
            subscription,
            metrics: { activeUsers: 1, pendingUsers: 0, suspendedUsers: 0, activeUnits: 0, availableUnits: 2 },
            activationTimeline: [],
            onboarding: { status: 'completed', steps: [] },
            latestOrder: null,
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/api/account/subscription')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: subscription }) });
      return;
    }

    if (pathname.endsWith('/api/portal/onboarding')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { status: 'completed', steps: [] } }) });
      return;
    }

    if (pathname.endsWith('/api/admin/activation-keys')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            summary: {
              planId: 'starter-2',
              planName: '2 combis',
              planStatus: 'active',
              maxUnits: 2,
              maxDrivers: 2,
              activeUnits: 0,
              activeDrivers: 0,
              keysGenerated: 0,
              keysAvailable: 0,
              keysUsed: 0,
              keysExpired: 0,
              keysRevoked: 0,
              availableSlots: 2,
              remainingDriverSlots: 2,
            },
            keys: [],
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/api/navigation/sessions/history')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { items: [], limit: 20, offset: 0, total: 0 } }),
      });
      return;
    }

    if ([
      '/api/account/invoices',
      '/api/account/sessions',
      '/api/users',
      '/api/vehicles',
      '/api/operational-units',
    ].some((endpoint) => pathname.endsWith(endpoint))) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
      return;
    }

    await route.fulfill({
      status: method === 'POST' ? 201 : 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: method === 'GET' ? [] : {} }),
    });
  });
}

async function expectNavigationItems(page: Page, labels: string[], visible: boolean) {
  for (const label of labels) {
    const item = page.getByRole('button', { name: label, exact: true });
    if (visible) {
      await expect(item, `Falta navegación ${label}`).toBeVisible();
    } else {
      await expect(item, `No debe mostrarse navegación ${label}`).toHaveCount(0);
    }
  }
}

const fullPortalItems = ['Mi plan', 'Facturación', 'Pagos', 'Equipo', 'Unidades', 'Rutas'];
const billingItems = ['Mi plan', 'Facturación', 'Pagos'];
const managementItems = ['Equipo', 'Unidades', 'Rutas'];

test.describe('PHASE-1-RBAC — matriz autenticada local por rol', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(Boolean(String(process.env.CERT_BASE_URL || '').trim()), 'La matriz RBAC local no modifica una URL desplegada.');
    test.skip(testInfo.project.name !== 'desktop-1280', 'La matriz RBAC contractual se ejecuta una vez en escritorio.');
  });

  for (const role of ['owner', 'admin'] as const) {
    test(`${role} conserva administración y facturación`, async ({ page }, testInfo) => {
      await installRoleContract(page, identities[role]);
      const probe = attachRuntimeProbe(page);
      try {
        await page.goto('/portal', { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await expect(page).toHaveURL(/\/portal(?:\/|$)/);
        await expectNavigationItems(page, fullPortalItems, true);
        await assertNoDocumentOverflow(page);
        await attachFullPageScreenshot(page, testInfo, `${role}-local-rbac`);
        expect(probe.pageErrors).toEqual([]);
        expect(probe.serverErrors).toEqual([]);
      } finally {
        probe.dispose();
      }
    });
  }

  test('billing_manager conserva solo módulos comerciales', async ({ page }, testInfo) => {
    await installRoleContract(page, identities.billing_manager);
    const probe = attachRuntimeProbe(page);
    try {
      await page.goto('/portal', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await expect(page).toHaveURL(/\/portal(?:\/|$)/);
      await expectNavigationItems(page, billingItems, true);
      await expectNavigationItems(page, managementItems, false);
      await assertNoDocumentOverflow(page);
      await attachFullPageScreenshot(page, testInfo, 'billing-local-rbac');
      expect(probe.pageErrors).toEqual([]);
      expect(probe.serverErrors).toEqual([]);
    } finally {
      probe.dispose();
    }
  });

  test('supervisor no recibe Portal empresarial', async ({ page }, testInfo) => {
    await installRoleContract(page, identities.supervisor);
    const probe = attachRuntimeProbe(page);
    try {
      await page.goto('/portal', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(500);
      await expect(page).not.toHaveURL(/\/portal(?:\/|$)/);
      await expectNavigationItems(page, fullPortalItems, false);
      await assertNoDocumentOverflow(page);
      await attachFullPageScreenshot(page, testInfo, 'supervisor-local-rbac');
      expect(probe.pageErrors).toEqual([]);
      expect(probe.serverErrors).toEqual([]);
    } finally {
      probe.dispose();
    }
  });
});
