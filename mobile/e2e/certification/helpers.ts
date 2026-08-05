import { expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

type RuntimeProbe = {
  pageErrors: string[];
  serverErrors: string[];
  dispose: () => void;
};

const LOCAL_COMMERCIAL_PLANS = [
  {
    id: 'starter-2',
    name: '2 combis',
    units: 2,
    price: 149,
    pricePerVehicle: 74.5,
    strategy: 'Entrada',
    badge: 'Arranque rápido',
    accent: 'info',
    subtitle: 'Ideal para pilotos y patios pequeños',
    trialDays: 7,
    trialEligible: true,
    includesRadioModule: false,
    radioAddonEligible: true,
    radioAddonPrice: 20,
  },
  {
    id: 'value-4',
    name: '4 combis',
    units: 4,
    price: 209,
    pricePerVehicle: 52.3,
    strategy: 'Mejor valor',
    badge: 'Más vendido',
    accent: 'success',
    subtitle: 'El punto de entrada más balanceado',
    trialDays: 0,
    trialEligible: false,
    includesRadioModule: false,
    radioAddonEligible: true,
    radioAddonPrice: 20,
  },
  {
    id: 'control-6',
    name: '6 combis',
    units: 6,
    price: 299,
    pricePerVehicle: 49.8,
    strategy: 'Ajustado',
    badge: 'Operación estable',
    accent: 'warning',
    subtitle: 'Pensado para crecimiento con control operativo',
    trialDays: 0,
    trialEligible: false,
    includesRadioModule: false,
    radioAddonEligible: true,
    radioAddonPrice: 20,
  },
  {
    id: 'premium-8',
    name: '8 combis',
    units: 8,
    price: 449,
    pricePerVehicle: 56.1,
    strategy: 'Premium',
    badge: 'Cobertura total',
    accent: 'danger',
    subtitle: 'Mayor cobertura, supervisores y evidencia',
    trialDays: 0,
    trialEligible: false,
    includesRadioModule: true,
    radioAddonEligible: false,
    radioAddonPrice: 0,
  },
  {
    id: 'enterprise-12',
    name: '12 combis',
    units: 12,
    price: 749,
    pricePerVehicle: 62.4,
    strategy: 'Empresas',
    badge: 'Escala multi patio',
    accent: 'info',
    subtitle: 'Multi patio, onboarding y despliegue empresarial',
    trialDays: 0,
    trialEligible: false,
    includesRadioModule: true,
    radioAddonEligible: false,
    radioAddonPrice: 0,
  },
];

export async function installLocalCertificationContracts(page: Page) {
  if (String(process.env.CERT_BASE_URL || '').trim()) return;

  await page.route('**/api/commercial/plans', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: LOCAL_COMMERCIAL_PLANS }),
    });
  });
}

export function attachRuntimeProbe(page: Page): RuntimeProbe {
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];

  const onPageError = (error: Error) => pageErrors.push(error.message);
  const onResponse = (response: { status: () => number; url: () => string }) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  };

  page.on('pageerror', onPageError);
  page.on('response', onResponse);

  return {
    pageErrors,
    serverErrors,
    dispose: () => {
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    },
  };
}

export async function assertNoDocumentOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(
    dimensions.scrollWidth,
    `El documento desborda horizontalmente: ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px`
  ).toBeLessThanOrEqual(dimensions.clientWidth + 2);
}

export async function attachFullPageScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach(`${testInfo.project.name}-${name}.png`, {
    body: screenshot,
    contentType: 'image/png',
  });
}

export async function loginPortal(page: Page, email: string, password: string) {
  await page.goto('/ventas/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Iniciar sesión').first()).toBeVisible();

  const inputs = page.locator('input');
  await expect(inputs.nth(0)).toBeVisible();
  await expect(inputs.nth(1)).toBeVisible();
  await inputs.nth(0).fill(email);
  await inputs.nth(1).fill(password);

  const submit = page.getByRole('button', { name: /iniciar sesi[oó]n/i }).last();
  await expect(submit).toBeEnabled();
  await submit.click();
  await page.waitForURL((url) => !url.pathname.includes('/ventas/login'), { timeout: 45_000 });
}

export async function createAuthenticatedContext(
  browserContextFactory: () => Promise<BrowserContext>,
  email: string,
  password: string
) {
  const context = await browserContextFactory();
  const page = await context.newPage();
  await loginPortal(page, email, password);
  return { context, page };
}

export function getCertificationCredentials(prefix: 'OWNER' | 'ADMIN' | 'SUPERVISOR' | 'BILLING') {
  const email = String(process.env[`CERT_${prefix}_EMAIL`] || '').trim();
  const password = String(process.env[`CERT_${prefix}_PASSWORD`] || '');
  return { email, password, configured: Boolean(email && password) };
}

export function mutationsEnabled() {
  return String(process.env.CERT_ALLOW_MUTATIONS || '').trim() === '1';
}
