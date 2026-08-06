import { expect, test } from '@playwright/test';
import {
  assertNoDocumentOverflow,
  attachFullPageScreenshot,
  getCertificationCredentials,
  loginPortal,
  mutationsEnabled,
} from './helpers';

function meetsPasswordPolicy(value: string) {
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

async function fillPasswordForm(
  page: Parameters<typeof loginPortal>[0],
  currentPassword: string,
  newPassword: string
) {
  await page.getByLabel('Contraseña actual').fill(currentPassword);
  await page.getByLabel('Nueva contraseña').fill(newPassword);
  await page.getByLabel('Confirmar nueva contraseña').fill(newPassword);
}

test.describe.serial('CERT-PROD-01 — cuenta y seguridad', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'La matriz destructiva se ejecuta una vez en escritorio.');
  });

  test('rechaza contraseña actual incorrecta y restaura el cambio correcto', async ({ page }, testInfo) => {
    const owner = getCertificationCredentials('OWNER');
    const temporaryPassword = String(process.env.CERT_OWNER_NEXT_PASSWORD || '');

    test.skip(!owner.configured, 'Faltan CERT_OWNER_EMAIL y CERT_OWNER_PASSWORD.');
    test.skip(!mutationsEnabled(), 'CERT_ALLOW_MUTATIONS debe ser 1 para cambiar contraseña.');
    test.skip(!temporaryPassword, 'Falta CERT_OWNER_NEXT_PASSWORD.');
    test.skip(owner.password === temporaryPassword, 'La contraseña temporal debe ser diferente.');
    test.skip(
      !meetsPasswordPolicy(owner.password) || !meetsPasswordPolicy(temporaryPassword),
      'Ambas contraseñas deben cumplir la política para garantizar rollback.'
    );

    await loginPortal(page, owner.email, owner.password);
    await page.goto('/portal/perfil?section=seguridad', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Cambiar contraseña')).toBeVisible();

    await fillPasswordForm(page, `${owner.password}-incorrecta`, temporaryPassword);
    await page.getByRole('button', { name: 'Actualizar contraseña' }).click();
    await expect(page.getByText(/contraseña actual no es correcta/i)).toBeVisible();

    let changed = false;
    try {
      await fillPasswordForm(page, owner.password, temporaryPassword);
      await page.getByRole('button', { name: 'Actualizar contraseña' }).click();
      await expect(page.getByText(/contraseña actualizada/i)).toBeVisible();
      changed = true;
      await assertNoDocumentOverflow(page);
      await attachFullPageScreenshot(page, testInfo, 'password-changed');
    } finally {
      if (changed) {
        await fillPasswordForm(page, temporaryPassword, owner.password);
        await page.getByRole('button', { name: 'Actualizar contraseña' }).click();
        await expect(page.getByText(/contraseña actualizada/i)).toBeVisible();
      }
    }
  });

  test('cerrar las demás conserva la sesión actual y revoca otra sesión', async ({ browser, page }, testInfo) => {
    const owner = getCertificationCredentials('OWNER');
    test.skip(!owner.configured, 'Faltan CERT_OWNER_EMAIL y CERT_OWNER_PASSWORD.');
    test.skip(!mutationsEnabled(), 'CERT_ALLOW_MUTATIONS debe ser 1 para revocar sesiones.');

    const baseURL = String(testInfo.project.use.baseURL || process.env.CERT_BASE_URL || 'http://127.0.0.1:8081');
    const secondContext = await browser.newContext({
      baseURL,
      viewport: testInfo.project.use.viewport as { width: number; height: number } | undefined,
    });
    const secondPage = await secondContext.newPage();

    try {
      await loginPortal(page, owner.email, owner.password);
      await loginPortal(secondPage, owner.email, owner.password);

      await page.goto('/portal/perfil?section=seguridad', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Sesiones activas')).toBeVisible();
      const revokeButton = page.getByRole('button', { name: 'Cerrar las demás' }).first();
      await expect(revokeButton).toBeVisible();
      await revokeButton.click();
      await expect(page.getByText('Cerrar todas las demás sesiones')).toBeVisible();
      await page.getByRole('button', { name: 'Cerrar las demás' }).last().click();
      await expect(page.getByText(/se cerraron|no había otras sesiones/i)).toBeVisible();
      await expect(page).toHaveURL(/\/portal/);

      await secondPage.reload({ waitUntil: 'domcontentloaded' });
      await secondPage.waitForTimeout(1_000);
      await expect(secondPage).toHaveURL(/\/ventas\/login|\/login/);
      await attachFullPageScreenshot(page, testInfo, 'sessions-revoked');
    } finally {
      await secondContext.close();
    }
  });
});
