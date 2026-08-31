import { expect, test } from '@playwright/test';
import {
  assertNoDocumentOverflow,
  attachFullPageScreenshot,
  attachRuntimeProbe,
  installLocalCertificationContracts,
} from './helpers';

const routes = [
  { name: 'ventas', path: '/ventas', signal: /Controla tu flotilla desde una sola operación conectada/i },
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
    await page.emulateMedia({ reducedMotion: 'reduce' });
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
    await expect(page.getByText('Elige el tamaño que corresponde a tu flotilla')).toBeVisible();
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

  test('header conserva acciones completas dentro de cada viewport', async ({ page }) => {
    await page.goto('/ventas', { waitUntil: 'domcontentloaded' });
    const viewport = page.viewportSize();
    expect(viewport, 'El proyecto debe declarar viewport').not.toBeNull();

    const header = page.getByTestId('sales-site-header');
    await expect(header).toBeVisible();
    const headerBox = await header.boundingBox();
    expect(headerBox, 'La cabecera debe tener geometría medible').not.toBeNull();

    if (viewport && headerBox) {
      expect(headerBox.x).toBeGreaterThanOrEqual(-1);
      expect(headerBox.x + headerBox.width).toBeLessThanOrEqual(viewport.width + 1);
    }

    const headerButtons = header.getByRole('button');
    const buttonCount = await headerButtons.count();
    for (let index = 0; index < buttonCount; index += 1) {
      const box = await headerButtons.nth(index).boundingBox();
      expect(box, `La acción ${index + 1} debe tener geometría medible`).not.toBeNull();
      if (viewport && box) {
        expect(box.x, `La acción ${index + 1} no debe recortarse a la izquierda`).toBeGreaterThanOrEqual(0);
        expect(
          box.x + box.width,
          `La acción ${index + 1} no debe recortarse a la derecha en ${viewport.width}px`
        ).toBeLessThanOrEqual(viewport.width);
      }
    }

    const secondaryAction = header.getByRole('button', { name: /^Ver planes\b/i });
    if (viewport && viewport.width < 430) {
      await expect(secondaryAction).toHaveCount(0);
      await expect(header.getByRole('button', { name: /Iniciar sesión|Abrir portal/i })).toBeVisible();
    } else {
      await expect(secondaryAction).toBeVisible();
    }

    await assertNoDocumentOverflow(page);
  });

  test('auth expone labels, autocomplete, foco y targets medibles', async ({ page }) => {
    await page.goto('/ventas/login', { waitUntil: 'domcontentloaded' });

    const loginTab = page.getByRole('tab', { name: 'Iniciar sesión' });
    const registerTab = page.getByRole('tab', { name: 'Registrarse' });
    await expect(loginTab).toHaveAttribute('aria-selected', 'true');

    for (const tab of [loginTab, registerTab]) {
      const box = await tab.boundingBox();
      expect(box, 'Cada pestaña debe tener geometría medible').not.toBeNull();
      expect(box?.height ?? 0, 'Cada pestaña debe ofrecer un target de al menos 44px').toBeGreaterThanOrEqual(44);
    }

    const identity = page.getByLabel('Correo o teléfono', { exact: true });
    const password = page.getByLabel('Contraseña', { exact: true });
    const passwordToggle = page.getByRole('button', { name: 'Mostrar contraseña' });
    await expect(identity).toHaveAttribute('autocomplete', 'username');
    await expect(password).toHaveAttribute('autocomplete', 'current-password');

    await identity.focus();
    await expect(identity).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(password).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(passwordToggle).toBeFocused();

    const toggleBox = await passwordToggle.boundingBox();
    expect(toggleBox, 'El toggle de contraseña debe tener geometría medible').not.toBeNull();
    expect(toggleBox?.width ?? 0).toBeGreaterThanOrEqual(36);
    expect(toggleBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    for (const target of [
      page.getByRole('checkbox', { name: 'Recordarme' }),
      page.getByRole('link', { name: 'Recuperar acceso' }),
    ]) {
      const box = await target.boundingBox();
      expect(box, 'Las acciones auxiliares deben tener geometría medible').not.toBeNull();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(32);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
    }

    await registerTab.click();
    await expect(page.getByLabel('Nombre (opcional)', { exact: true })).toHaveAttribute('autocomplete', 'name');
    await expect(page.getByLabel('Empresa o flotilla (opcional)', { exact: true })).toHaveAttribute(
      'autocomplete',
      'organization'
    );
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute('autocomplete', 'new-password');
    await expect(page.getByLabel('Confirmar contraseña', { exact: true })).toHaveAttribute(
      'autocomplete',
      'new-password'
    );
    await assertNoDocumentOverflow(page);
  });

  test('landing ejecuta movimiento público visible cuando el sistema permite animaciones', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/ventas', { waitUntil: 'domcontentloaded' });

    const ambientWash = page.getByTestId('sales-ambient-wash');
    await expect(ambientWash).toBeAttached();
    const ambientAnimation = await ambientWash.evaluate((node) => window.getComputedStyle(node).animationName);
    expect(ambientAnimation, 'El fondo público debe conservar su keyframe ambiental').toContain('manecombGradientShift');

    const firstPlanCard = page.getByRole('button', { name: 'Seleccionar plan 2 combis' });
    await firstPlanCard.scrollIntoViewIfNeeded();
    await expect(firstPlanCard).toBeVisible();

    // Espera a que termine el reveal escalonado; después el hover debe seguir teniendo
    // movimiento propio. Así certificamos ambos estados sin depender de una captura estática.
    await page.waitForTimeout(1_050);
    const beforeHover = await firstPlanCard.evaluate((node) => ({
      opacity: window.getComputedStyle(node).opacity,
      transform: window.getComputedStyle(node).transform,
      transitionDuration: window.getComputedStyle(node).transitionDuration,
    }));

    expect(Number.parseFloat(beforeHover.opacity)).toBeGreaterThanOrEqual(0.99);
    expect(beforeHover.transitionDuration).not.toBe('0s');

    await firstPlanCard.hover();
    await page.waitForTimeout(360);
    const afterHoverTransform = await firstPlanCard.evaluate((node) => window.getComputedStyle(node).transform);

    expect(
      afterHoverTransform,
      'La tarjeta debe cambiar físicamente de transform al hover; no basta declarar transition'
    ).not.toBe(beforeHover.transform);
  });
});
