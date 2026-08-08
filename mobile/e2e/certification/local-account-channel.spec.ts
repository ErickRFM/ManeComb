import { expect, test, type Page } from '@playwright/test';
import {
  assertNoDocumentOverflow,
  attachFullPageScreenshot,
  attachRuntimeProbe,
} from './helpers';

type AccountChannel =
  | 'blocked'
  | 'company_portal'
  | 'mobile_operations'
  | 'platform_admin';

type LocalIdentity = {
  accountChannel: AccountChannel;
  accountType: 'company_owner' | 'operations';
  role: string;
  destination: string;
  productRoute: string;
  canAccessPortal: boolean;
  canAccessMobile: boolean;
  canUseOperations: boolean;
  mobileBlockReason: string | null;
  operationalBlockReason: string | null;
};

const ACTIVE_SUBSCRIPTION = {
  id: 'subscription-certification',
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

const ACTIVE_TENANT = {
  id: 'tenant-certification',
  organizationId: 'tenant-certification',
  companyId: 'tenant-certification',
  name: 'Empresa Certificación',
  status: 'active',
  isOperational: true,
};

const ONBOARDING = {
  status: 'completed',
  steps: [],
};

const ACTIVATION_SUMMARY = {
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
};

function buildUser(identity: LocalIdentity) {
  return {
    id: `user-${identity.accountChannel}`,
    name: `Usuario ${identity.accountChannel}`,
    email: `${identity.accountChannel}@certification.manecomb.test`,
    role: identity.role,
    accountType: identity.accountType,
    accountChannel: identity.accountChannel,
    accountChannelReason: `${identity.accountChannel}_certification`,
    organizationId: 'tenant-certification',
    userStatus: 'active',
    phone: '',
    shift: '',
    status: 'online',
    avatar: 'MC',
    vehicleId: null,
  };
}

function buildSession(identity: LocalIdentity) {
  const user = buildUser(identity);
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
    mobileBlockReason: identity.mobileBlockReason,
    operationalBlockReason: identity.operationalBlockReason,
    subscription: ACTIVE_SUBSCRIPTION,
    tenant: ACTIVE_TENANT,
    onboarding: ONBOARDING,
  };

  return {
    ok: true,
    profile: {
      user,
      documents: [],
    },
    user,
    authContext,
    accountChannel: identity.accountChannel,
    accountChannelReason: user.accountChannelReason,
    canAccessPortal: identity.canAccessPortal,
    canAccessMobile: identity.canAccessMobile,
    canUseOperations: identity.canUseOperations,
    mobileBlockReason: identity.mobileBlockReason,
    operationalBlockReason: identity.operationalBlockReason,
    postLoginDestination: identity.destination,
    postLoginRoute: identity.productRoute,
    productDestination: identity.destination,
    productRoute: identity.productRoute,
    subscription: ACTIVE_SUBSCRIPTION,
    tenant: ACTIVE_TENANT,
    onboarding: ONBOARDING,
    dashboard: null,
  };
}

async function installAuthenticatedContract(page: Page, identity: LocalIdentity) {
  const session = buildSession(identity);
  const user = session.user;

  await page.addInitScript(() => {
    window.localStorage.setItem('manecomb-ventas-token', 'local-certification-token');
    window.localStorage.setItem('manecomb-ventas-refresh-token', 'local-certification-refresh');
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();

    // Vite también sirve módulos bajo rutas como /src/api/client.ts. El mock
    // contractual solo debe responder a endpoints reales del backend.
    if (!pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }

    if (pathname.endsWith('/api/auth/session')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(session),
      });
      return;
    }

    if (pathname.endsWith('/api/portal/overview')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            organization: {
              id: ACTIVE_TENANT.id,
              name: ACTIVE_TENANT.name,
              fleetSize: 0,
              status: 'active',
            },
            account: {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              accountType: user.accountType,
              userStatus: 'active',
            },
            subscription: ACTIVE_SUBSCRIPTION,
            metrics: {
              activeUsers: 1,
              pendingUsers: 0,
              suspendedUsers: 0,
              activeUnits: 0,
              availableUnits: 2,
            },
            activationTimeline: [],
            onboarding: ONBOARDING,
            latestOrder: null,
          },
        }),
      });
      return;
    }

    if (pathname.endsWith('/api/account/subscription')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: ACTIVE_SUBSCRIPTION }),
      });
      return;
    }

    if (pathname.endsWith('/api/portal/onboarding')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: ONBOARDING }),
      });
      return;
    }

    if (pathname.endsWith('/api/admin/activation-keys')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: { summary: ACTIVATION_SUMMARY, keys: [] },
        }),
      });
      return;
    }

    if (pathname.endsWith('/api/navigation/sessions/history')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: { items: [], limit: 20, offset: 0, total: 0 },
        }),
      });
      return;
    }

    const arrayEndpoints = [
      '/api/account/invoices',
      '/api/account/sessions',
      '/api/users',
      '/api/vehicles',
      '/api/operational-units',
    ];

    if (arrayEndpoints.some((endpoint) => pathname.endsWith(endpoint))) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: [] }),
      });
      return;
    }

    await route.fulfill({
      status: method === 'POST' ? 201 : 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: method === 'GET' ? [] : {} }),
    });
  });
}

const cases: Array<{
  name: string;
  identity: LocalIdentity;
  expectedPath: RegExp;
  expectedText: RegExp;
}> = [
  {
    name: 'empresa conserva Portal web y acceso administrativo Mobile',
    identity: {
      accountChannel: 'company_portal',
      accountType: 'company_owner',
      role: 'owner',
      destination: 'CompanyPortal',
      productRoute: '/portal',
      canAccessPortal: true,
      canAccessMobile: true,
      canUseOperations: true,
      mobileBlockReason: null,
      operationalBlockReason: null,
    },
    expectedPath: /\/portal(?:\/|$)/,
    expectedText: /Operaciones/i,
  },
  {
    name: 'operación recibe frontera de Mobile',
    identity: {
      accountChannel: 'mobile_operations',
      accountType: 'operations',
      role: 'driver',
      destination: 'HomeConductor',
      productRoute: '/mapa',
      canAccessPortal: false,
      canAccessMobile: true,
      canUseOperations: true,
      mobileBlockReason: null,
      operationalBlockReason: null,
    },
    expectedPath: /\/acceso-operativo(?:\/|$)/,
    expectedText: /Continúa en la app móvil/i,
  },
  {
    name: 'Platform recibe frontera de Admin Global',
    identity: {
      accountChannel: 'platform_admin',
      accountType: 'operations',
      role: 'platform_owner',
      destination: 'PlatformAdmin',
      productRoute: '/platform',
      canAccessPortal: false,
      canAccessMobile: false,
      canUseOperations: false,
      mobileBlockReason: 'wrong_channel',
      operationalBlockReason: 'wrong_channel',
    },
    expectedPath: /\/acceso-admin(?:\/|$)/,
    expectedText: /Usa Admin Global/i,
  },
  {
    name: 'identidad inválida recibe bloqueo explícito',
    identity: {
      accountChannel: 'blocked',
      accountType: 'company_owner',
      role: 'driver',
      destination: 'AccessBlocked',
      productRoute: '/access-blocked',
      canAccessPortal: false,
      canAccessMobile: false,
      canUseOperations: false,
      mobileBlockReason: 'account_blocked',
      operationalBlockReason: 'account_blocked',
    },
    expectedPath: /\/acceso-restringido(?:\/|$)/,
    expectedText: /Cuenta sin producto autorizado/i,
  },
];

test.describe('PHASE-1 — matriz local de canal autenticado', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(Boolean(String(process.env.CERT_BASE_URL || '').trim()), 'La matriz local no modifica una URL desplegada.');
    test.skip(testInfo.project.name !== 'desktop-1280', 'La matriz contractual se ejecuta una vez en escritorio.');
  });

  for (const entry of cases) {
    test(entry.name, async ({ page }, testInfo) => {
      await installAuthenticatedContract(page, entry.identity);
      const probe = attachRuntimeProbe(page);

      try {
        const response = await page.goto('/portal', {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });

        expect(response).not.toBeNull();
        expect(response?.status()).toBeLessThan(500);
        await expect(page).toHaveURL(entry.expectedPath);
        await expect(page.locator('body')).toHaveText(entry.expectedText);
        await assertNoDocumentOverflow(page);
        await attachFullPageScreenshot(page, testInfo, entry.identity.accountChannel);

        expect(probe.pageErrors).toEqual([]);
        expect(probe.serverErrors).toEqual([]);
      } finally {
        probe.dispose();
      }
    });
  }
});