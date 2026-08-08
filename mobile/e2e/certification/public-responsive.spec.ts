import { expect, test } from '@playwright/test';
import {
  assertNoDocumentOverflow,
  attachFullPageScreenshot,
  attachRuntimeProbe,
  installLocalCertificationContracts,
} from './helpers';

const routes = [
  { name: 'ventas', path: '/ventas', signal: /Tu flotilla, tu equipo y tus rutas/i },
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
  test.beforeEach(async ({ page }) => {
    await installLocalCertificationContracts(page);
  });

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
    await expect(page.getByText('Elige la capacidad de tu flotilla')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Elegir plan' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Usar demo \d+ días/i }).first()).toBeVisible();

    const firstPlanCard = page.getByRole('button', { name: 'Seleccionar plan 2 combis' });
    await firstPlanCard.scrollIntoViewIfNeeded();
    await expect(firstPlanCard).toBeVisible();

    const finalFeature = firstPlanCard.getByText('Activación directa', { exact: true });
    const buyAction = firstPlanCard.getByRole('button', { name: 'Elegir plan: 2 combis' });
    const trialAction = firstPlanCard.getByRole('button', { name: /Usar demo \d+ días: 2 combis/i });
    await expect(finalFeature).toBeVisible();
    await expect(buyAction).toBeVisible();
    await expect(trialAction).toBeVisible();

    const [cardBox, finalFeatureBox, buyActionBox, trialActionBox] = await Promise.all([
      firstPlanCard.boundingBox(),
      finalFeature.boundingBox(),
      buyAction.boundingBox(),
      trialAction.boundingBox(),
    ]);

    expect(cardBox, 'La tarjeta de plan debe tener dimensiones medibles').not.toBeNull();
    expect(finalFeatureBox, 'La última característica debe tener dimensiones medibles').not.toBeNull();
    expect(buyActionBox, 'El CTA principal debe tener dimensiones medibles').not.toBeNull();
    expect(trialActionBox, 'El CTA de demo debe tener dimensiones medibles').not.toBeNull();

    if (cardBox && finalFeatureBox && buyActionBox && trialActionBox) {
      expect(
        buyActionBox.y - (finalFeatureBox.y + finalFeatureBox.height),
        'El CTA principal no debe montarse sobre las características del plan'
      ).toBeGreaterThanOrEqual(6);
      expect(
        trialActionBox.y - (buyActionBox.y + buyActionBox.height),
        'La acción de demo debe conservar separación respecto al CTA principal'
      ).toBeGreaterThanOrEqual(6);
      expect(
        cardBox.y + cardBox.height - (trialActionBox.y + trialActionBox.height),
        'Las acciones deben permanecer dentro de la tarjeta'
      ).toBeGreaterThanOrEqual(12);
    }

    const viewport = page.viewportSize();
    if (viewport && viewport.width <= 640) {
      const cardBoxMobile = await firstPlanCard.boundingBox();
      expect(cardBoxMobile, 'La tarjeta móvil debe tener dimensiones medibles').not.toBeNull();
      expect(
        cardBoxMobile?.width ?? 0,
        'La tarjeta móvil debe ocupar prácticamente todo el ancho útil'
      ).toBeGreaterThanOrEqual(viewport.width - 36);

      const planName = firstPlanCard.getByText('2 combis', { exact: true });
      const titleFontSize = await planName.evaluate((node) =>
        Number.parseFloat(window.getComputedStyle(node).fontSize)
      );
      expect(titleFontSize, 'El título del plan no debe usar escala compacta en 360 px').toBeGreaterThanOrEqual(27);

      const cardPadding = await firstPlanCard.evaluate((node) =>
        Number.parseFloat(window.getComputedStyle(node).paddingLeft)
      );
      expect(cardPadding, 'La tarjeta móvil debe conservar el padding completo').toBeGreaterThanOrEqual(19);

      const screenshot = await page.screenshot({ fullPage: false });
      await testInfo.attach(`${testInfo.project.name}-landing-plan-mobile-scale.png`, {
        body: screenshot,
        contentType: 'image/png',
      });
    }

    await assertNoDocumentOverflow(page);
    await attachFullPageScreenshot(page, testInfo, 'landing-planes');
  });
});
