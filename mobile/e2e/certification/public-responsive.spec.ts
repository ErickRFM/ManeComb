import { expect, test } from '@playwright/test';
import {
  assertNoDocumentOverflow,
  attachFullPageScreenshot,
  attachRuntimeProbe,
} from './helpers';

const routes = [
  { name: 'ventas', path: '/ventas', signal: /ManeComb|Planes disponibles/i },
  { name: 'login', path: '/ventas/login', signal: /Iniciar sesi[oó]n/i },
  { name: 'registro', path: '/ventas/registro', signal: /Registrarse/i },
  {
    name: 'recuperacion',
    path: '/ventas/recuperar-contrasena',
    signal: /recuperar|restablecer|contrase/i,
  },
  {
    name: 'reset-invalido',
    path: '/reset-password?token=certificacion-token-invalido',
    signal: /contrase|enlace|token/i,
  },
  { name: 'portal-sin-sesion', path: '/portal', signal: /Iniciar sesi[oó]n|Registrarse/i },
];

test.describe('CERT-PROD-01 — responsive público', () => {
  for (const route of routes) {
    test(`${route.name} renderiza sin error ni overflow`, async ({ page }, testInfo) => {
      const probe = attachRuntimeProbe(page);

      try {
        const response = await page.goto(route.path, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });

        expect(response, `No hubo respuesta navegando a ${route.path}`).not.toBeNull();
        expect(response?.status(), `HTTP inesperado en ${route.path}`).toBeLessThan(500);
        await expect(page.locator('body')).toBeVisible();
        await expect(page.locator('body')).not.toHaveText(/Application error|Cannot GET|Not found/i);
        await expect(page.locator('body')).toHaveText(route.signal);
        await assertNoDocumentOverflow(page);
        await attachFullPageScreenshot(page, testInfo, route.name);

        expect(probe.pageErrors, `Errores JavaScript en ${route.path}`).toEqual([]);
        expect(probe.serverErrors, `Respuestas 5xx en ${route.path}`).toEqual([]);
      } finally {
        probe.dispose();
      }
    });
  }

  test('landing conserva jerarquía comercial y acciones de planes', async ({ page }, testInfo) => {
    await page.goto('/ventas', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('ManeComb').first()).toBeVisible();
    await expect(page.getByText(/Planes disponibles/i).first()).toBeVisible();
    await expect(page.getByText(/Comprar/i).first()).toBeVisible();
    await expect(page.getByText(/Prueba|Probar/i).first()).toBeVisible();
    await assertNoDocumentOverflow(page);
    await attachFullPageScreenshot(page, testInfo, 'landing-planes');
  });
});
