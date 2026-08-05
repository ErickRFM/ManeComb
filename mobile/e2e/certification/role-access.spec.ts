import { expect, test } from '@playwright/test';
import {
  assertNoDocumentOverflow,
  attachFullPageScreenshot,
  getCertificationCredentials,
  loginPortal,
} from './helpers';

const fullPortalItems = ['Mi plan', 'Facturación', 'Pagos', 'Equipo', 'Unidades', 'Rutas'];
const billingItems = ['Mi plan', 'Facturación', 'Pagos'];
const managementItems = ['Equipo', 'Unidades', 'Rutas'];

async function expectNavigationItems(page: Parameters<typeof loginPortal>[0], labels: string[], visible: boolean) {
  for (const label of labels) {
    const item = page.getByRole('button', { name: label, exact: true });
    if (visible) {
      await expect(item, `Falta navegación ${label}`).toBeVisible();
    } else {
      await expect(item, `No debe mostrarse navegación ${label}`).toHaveCount(0);
    }
  }
}

test.describe('CERT-PROD-01 — permisos por rol', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'La matriz de roles se ejecuta una vez en escritorio.');
  });

  for (const role of ['OWNER', 'ADMIN'] as const) {
    test(`${role.toLowerCase()} ve administración y facturación`, async ({ page }, testInfo) => {
      const credentials = getCertificationCredentials(role);
      test.skip(!credentials.configured, `Faltan CERT_${role}_EMAIL y CERT_${role}_PASSWORD.`);

      await loginPortal(page, credentials.email, credentials.password);
      await page.goto('/portal', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/portal(?:\/|$)/);
      await expectNavigationItems(page, fullPortalItems, true);
      await assertNoDocumentOverflow(page);
      await attachFullPageScreenshot(page, testInfo, `${role.toLowerCase()}-portal`);
    });
  }

  test('billing_manager solo ve módulos comerciales', async ({ page }, testInfo) => {
    const credentials = getCertificationCredentials('BILLING');
    test.skip(!credentials.configured, 'Faltan CERT_BILLING_EMAIL y CERT_BILLING_PASSWORD.');

    await loginPortal(page, credentials.email, credentials.password);
    await page.goto('/portal', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/portal(?:\/|$)/);
    await expectNavigationItems(page, billingItems, true);
    await expectNavigationItems(page, managementItems, false);
    await assertNoDocumentOverflow(page);
    await attachFullPageScreenshot(page, testInfo, 'billing-portal');
  });

  test('supervisor no entra al Portal empresarial', async ({ page }, testInfo) => {
    const credentials = getCertificationCredentials('SUPERVISOR');
    test.skip(!credentials.configured, 'Faltan CERT_SUPERVISOR_EMAIL y CERT_SUPERVISOR_PASSWORD.');

    await loginPortal(page, credentials.email, credentials.password);
    await page.goto('/portal', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_000);
    await expect(page).not.toHaveURL(/\/portal(?:\/|$)/);
    await expectNavigationItems(page, fullPortalItems, false);
    await assertNoDocumentOverflow(page);
    await attachFullPageScreenshot(page, testInfo, 'supervisor-redirect');
  });
});
