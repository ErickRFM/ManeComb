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

type LocalOperationsFixture = {
  vehicles?: Array<Record<string, unknown>>;
  operationalUnits?: Array<Record<string, unknown>>;
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


const TRACKING_VEHICLES = [
  {
    id: 'vehicle-c2',
    organizationId: ACTIVE_TENANT.id,
    code: 'C-2',
    plate: 'TLX-C2',
    status: 'assigned',
    driverName: 'Chofer C-2',
  },
  {
    id: 'vehicle-c4',
    organizationId: ACTIVE_TENANT.id,
    code: 'C-4',
    plate: 'TLX-C4',
    status: 'assigned',
    driverName: 'Chofer C-4',
  },
];

const TRACKING_OPERATIONAL_UNITS = [
  {
    snapshotVersion: 2,
    unitId: 'vehicle-c2',
    plates: 'TLX-C2',
    label: 'C-2',
    status: 'active',
    operationalState: 'on_route',
    gps: {
      lat: 19.3154,
      lng: -98.2395,
      speedKmh: 28,
      heading: 90,
      recordedAt: '2026-09-25T20:00:00.000Z',
      receivedAt: '2026-09-25T20:00:01.000Z',
      freshness: 'fresh',
      connectionState: 'live',
      ageSeconds: 3,
    },
    driver: { id: 'driver-c2', name: 'Chofer C-2', source: 'session' },
    route: {
      id: 'route-centro',
      name: 'Ruta Centro',
      startedAt: '2026-09-25T19:45:00.000Z',
      progressRatio: 0.42,
      remainingTimeSeconds: 900,
      etaAt: '2026-09-25T20:15:00.000Z',
      deviationMeters: 12,
      isOffRoute: false,
      currentCheckpoint: 'Centro',
    },
    session: { id: 'session-c2', startedAt: '2026-09-25T19:45:00.000Z', elapsedSeconds: 900 },
    journey: {
      id: 'journey-c2',
      status: 'RUNNING',
      driverId: 'driver-c2',
      vehicleId: 'vehicle-c2',
      routeId: 'route-centro',
      scheduledStartAt: '2026-09-25T19:45:00.000Z',
      scheduledEndAt: '2026-09-25T20:30:00.000Z',
      confirmedAt: '2026-09-25T19:44:00.000Z',
      confirmedBy: 'driver-c2',
      startedAt: '2026-09-25T19:45:00.000Z',
      pausedAt: null,
      resumedAt: null,
      elapsedSeconds: 900,
      requiresDriverConfirmation: false,
      canStart: false,
      isDriving: true,
      isPaused: false,
      legacyTiming: { inferredScheduledStartAt: null, reason: null },
    },
    incidents: { open: 0, inProgress: 0, lastAt: null },
    lastEventAt: '2026-09-25T20:00:01.000Z',
    visibility: 'visible',
  },
  {
    snapshotVersion: 2,
    unitId: 'vehicle-c4',
    plates: 'TLX-C4',
    label: 'C-4',
    status: 'idle',
    operationalState: 'stopped',
    gps: {
      lat: 19.3202,
      lng: -98.2326,
      speedKmh: 0,
      heading: 0,
      recordedAt: '2026-09-25T19:50:00.000Z',
      receivedAt: '2026-09-25T19:50:01.000Z',
      freshness: 'missing',
      connectionState: 'lost',
      ageSeconds: 601,
    },
    driver: { id: 'driver-c4', name: 'Chofer C-4', source: 'assignment' },
    route: null,
    session: null,
    journey: null,
    incidents: { open: 0, inProgress: 0, lastAt: null },
    lastEventAt: '2026-09-25T19:50:01.000Z',
    visibility: 'visible',
  },
];

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

async function installAuthenticatedContract(
  page: Page,
  identity: LocalIdentity,
  fixture: LocalOperationsFixture = {}
) {
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

    if (pathname.endsWith('/api/vehicles')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: fixture.vehicles || [] }),
      });
      return;
    }

    if (pathname.endsWith('/api/operational-units')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: fixture.operationalUnits || [] }),
      });
      return;
    }

    const arrayEndpoints = [
      '/api/account/invoices',
      '/api/account/sessions',
      '/api/users',
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

test.describe('CERT-RUTAS-EMPTY — cuenta nueva responsive', () => {
  test.beforeEach(() => {
    test.skip(Boolean(String(process.env.CERT_BASE_URL || '').trim()), 'La cuenta nueva se certifica con contratos locales controlados.');
  });

  test('Rutas conserva estados vacíos, scroll y acceso al editor', async ({ page }, testInfo) => {
    const companyIdentity = cases.find((entry) => entry.identity.accountChannel === 'company_portal')?.identity;
    expect(companyIdentity, 'Debe existir la identidad empresarial de certificación').toBeDefined();
    if (!companyIdentity) return;

    await installAuthenticatedContract(page, companyIdentity);
    const probe = attachRuntimeProbe(page);

    try {
      const response = await page.goto('/portal/rutas', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });

      expect(response).not.toBeNull();
      expect(response?.status()).toBeLessThan(500);
      await expect(page).toHaveURL(/\/portal\/rutas(?:\/|$)/);
      await expect(page.locator('body')).not.toHaveText(/Error en esta pantalla|Application error/i);

      await expect(page.getByText('Aún no hay unidades', { exact: true })).toBeVisible();
      await expect(page.getByText('Registra la primera unidad desde Gestión > Unidades para asignarle una ruta.', { exact: true })).toBeVisible();
      await expect(page.getByText('Aún no hay rutas', { exact: true })).toBeVisible();
      await expect(page.getByText('Selecciona una ruta', { exact: true })).toBeVisible();

      const contentScroll = page.locator('#portal-content-scroll');
      await expect(contentScroll).toBeVisible();
      const scrollState = await contentScroll.evaluate((node) => {
        const style = window.getComputedStyle(node);
        return {
          clientHeight: node.clientHeight,
          overflowY: style.overflowY,
          scrollHeight: node.scrollHeight,
        };
      });
      expect(scrollState.overflowY, 'La vista compacta de Rutas debe permitir desplazamiento vertical').toMatch(/auto|scroll/);
      expect(scrollState.scrollHeight).toBeGreaterThanOrEqual(scrollState.clientHeight);

      const assignmentHint = page.getByText(
        'La asignación se crea aquí sin sobrescribir automáticamente la ruta operativa.',
        { exact: true }
      );
      await assignmentHint.scrollIntoViewIfNeeded();
      await expect(assignmentHint).toBeVisible();

      await page.getByRole('button', { name: 'Nueva ruta' }).click();
      await expect(page.getByRole('heading', { name: 'Editor de ruta', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Guardar ruta' })).toBeVisible();

      const editorInputHeights = await Promise.all(
        ['Nombre de la ruta', 'Origen de la ruta', 'Destino de la ruta'].map((label) =>
          page.getByLabel(label).evaluate((node) => node.getBoundingClientRect().height)
        )
      );
      for (const height of editorInputHeights) {
        expect(height, 'Los campos del editor deben conservar altura de input y no llenar toda la columna').toBeLessThanOrEqual(56);
      }

      await page.getByRole('button', { name: 'Cancelar' }).click();
      await expect(page.getByRole('heading', { name: 'Rutas', exact: true })).toBeVisible();

      await assertNoDocumentOverflow(page);
      await attachFullPageScreenshot(page, testInfo, 'routes-empty-account');

      expect(probe.pageErrors).toEqual([]);
      expect(probe.serverErrors).toEqual([]);
    } finally {
      probe.dispose();
    }
  });
});


test.describe('CERT-OPERATIONS-MAP — seguimiento map-first responsive', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(Boolean(String(process.env.CERT_BASE_URL || '').trim()), 'La vista autenticada se certifica con contratos locales controlados.');
    test.skip(
      !['phone-320', 'phone-390', 'phone-430', 'tablet-768', 'desktop-1280'].includes(testInfo.project.name),
      'Matriz representativa del seguimiento responsive.'
    );
  });

  test('dos unidades conservan mapa dominante, sheet compacto y filtros sincronizados', async ({ page }, testInfo) => {
    const companyIdentity = cases.find((entry) => entry.identity.accountChannel === 'company_portal')?.identity;
    expect(companyIdentity, 'Debe existir la identidad empresarial de certificación').toBeDefined();
    if (!companyIdentity) return;

    await installAuthenticatedContract(page, companyIdentity, {
      vehicles: TRACKING_VEHICLES,
      operationalUnits: TRACKING_OPERATIONAL_UNITS,
    });
    const probe = attachRuntimeProbe(page);

    try {
      const response = await page.goto('/portal', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });

      expect(response).not.toBeNull();
      expect(response?.status()).toBeLessThan(500);
      await expect(page).toHaveURL(/\/portal(?:\/|$)/);
      await expect(page.locator('#operations-map-surface')).toBeVisible();
      await expect(page.locator('#operations-unit-selector')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Filtro Todas, 2 unidades' })).toBeVisible();

      const initialLayout = await page.evaluate(() => {
        const surface = document.querySelector<HTMLElement>('#operations-map-surface')?.getBoundingClientRect();
        const sheet = document.querySelector<HTMLElement>('#operations-unit-selector')?.getBoundingClientRect();
        const kpis = document.querySelector<HTMLElement>('#operations-kpi-grid');
        const refresh = document.querySelector<HTMLElement>('#operations-header-action [role="button"]')?.getBoundingClientRect();
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          surface: surface ? { width: surface.width, height: surface.height, left: surface.left, right: surface.right } : null,
          sheet: sheet ? { height: sheet.height, bottom: sheet.bottom } : null,
          kpiDisplay: kpis ? getComputedStyle(kpis).display : null,
          refresh: refresh ? { width: refresh.width, height: refresh.height } : null,
        };
      });

      expect(initialLayout.surface).not.toBeNull();
      expect(initialLayout.sheet).not.toBeNull();
      if (!initialLayout.surface || !initialLayout.sheet) return;

      expect(initialLayout.surface.height).toBeGreaterThan(initialLayout.viewport.height * 0.7);
      expect(initialLayout.surface.width).toBeGreaterThan(initialLayout.viewport.width * (initialLayout.viewport.width < 768 ? 0.94 : 0.68));
      expect(initialLayout.refresh?.height || 0).toBeGreaterThanOrEqual(43);
      expect(initialLayout.refresh?.width || 0).toBeGreaterThanOrEqual(43);

      if (initialLayout.viewport.width < 768) {
        expect(initialLayout.sheet.height).toBeLessThanOrEqual(82);
        expect(initialLayout.kpiDisplay).toBe('none');

        const sheetToggle = page.getByRole('button', { name: /Unidades en mapa \(2\)/i });
        await sheetToggle.click();
        await page.waitForTimeout(260);

        const mediumHeight = await page.locator('#operations-unit-selector').evaluate((node) => node.getBoundingClientRect().height);
        expect(mediumHeight).toBeGreaterThan(initialLayout.sheet.height + 20);
        expect(mediumHeight).toBeLessThan(initialLayout.viewport.height * 0.62);

        await expect(page.getByRole('button', { name: /GPS perdido.*1/i })).toBeVisible();
        await page.getByRole('button', { name: /GPS perdido.*1/i }).click();
        await expect(page.getByRole('button', { name: 'Filtro GPS perdido, 1 unidades' })).toBeVisible();
        const unitSheet = page.locator('#operations-unit-selector');
        await expect(unitSheet.getByRole('button', { name: 'Ver C-4', exact: true })).toBeVisible();
        await expect(unitSheet.getByRole('button', { name: 'Ver C-2', exact: true })).toHaveCount(0);

        await page.getByRole('button', { name: 'Filtro GPS perdido, 1 unidades' }).click();
        await expect(page.getByRole('button', { name: 'Filtro Todas, 2 unidades' })).toBeVisible();
        await unitSheet.getByRole('button', { name: 'Ver C-4', exact: true }).click();
        await expect(page.getByText(/Chofer C-4 · 0 km\/h/i)).toBeVisible();
        await expect(page.getByText(/Último GPS/i)).toBeVisible();

        await sheetToggle.click();
        await page.waitForTimeout(260);
        const expandedHeight = await page.locator('#operations-unit-selector').evaluate((node) => node.getBoundingClientRect().height);
        expect(expandedHeight).toBeGreaterThanOrEqual(mediumHeight);
        expect(expandedHeight).toBeLessThan(initialLayout.viewport.height * 0.82);
      }

      await assertNoDocumentOverflow(page);
      await attachFullPageScreenshot(page, testInfo, 'operations-map-two-units');

      expect(probe.pageErrors).toEqual([]);
      expect(probe.serverErrors).toEqual([]);
    } finally {
      probe.dispose();
    }
  });
});
