import { expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

type RuntimeProbe = {
  pageErrors: string[];
  serverErrors: string[];
  dispose: () => void;
};

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
