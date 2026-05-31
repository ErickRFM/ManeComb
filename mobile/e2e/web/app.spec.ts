import { expect, test } from '@playwright/test';

test.describe('Combis web smoke', () => {
  test('rutas principales renderizan sin pantalla en blanco', async ({ page }) => {
    const pageErrors: string[] = [];
    const failedResponses: string[] = [];

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    page.on('response', (response) => {
      if (response.status() >= 500) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    const routes = [
      { path: '/login', signal: /Iniciar sesi|Registrarse/i },
      { path: '/registro', signal: /Registrarse|Confirmar contrase/i },
      { path: '/ventas', signal: /ManeComb|Planes disponibles/i },
      { path: '/terminos', signal: /Reglas de uso|Terminos/i },
      { path: '/privacidad', signal: /protegemos|privacidad/i },
      { path: '/portal', signal: /Iniciar sesi|Registrarse/i },
      { path: '/mapa', signal: /Iniciar sesi|Registrarse/i },
    ];

    for (const route of routes) {
      await page.goto(route.path, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });

      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator('body')).not.toHaveText(/Application error|Cannot GET|Not found/i);
      await expect(page.locator('body')).toHaveText(route.signal);
    }

    expect(pageErrors).toEqual([]);
    expect(failedResponses).toEqual([]);
  });

  test('login carga y muestra el formulario principal', async ({ page }) => {
    await page.goto('/login', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await expect(page.getByText('Iniciar sesión').first()).toBeVisible();
    await expect(page.getByText('Registrarse').first()).toBeVisible();
    await expect(page.locator('input').nth(0)).toBeVisible();
    await expect(page.locator('input').nth(1)).toBeVisible();
  });

  test('ventas muestra el hero comercial y el carrusel de planes', async ({ page }) => {
    await page.goto('/ventas', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await expect(page.getByText('ManeComb')).toBeVisible();
    await expect(page.getByText('Planes disponibles.')).toBeVisible();
    await expect(page.getByText(/vendido/i).first()).toBeVisible();
    await expect(page.getByText('Comprar').first()).toBeVisible();
  });

  test('registro carga el formulario compacto', async ({ page }) => {
    await page.goto('/registro?planId=starter-2&trial=1', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await expect(page.getByText('Registrarse').first()).toBeVisible();
    await expect(page.locator('input').nth(0)).toBeVisible();
    await expect(page.locator('input').nth(1)).toBeVisible();
    await expect(page.locator('input').nth(2)).toBeVisible();
  });
});
