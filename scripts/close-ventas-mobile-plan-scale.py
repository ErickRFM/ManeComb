from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    text = target.read_text()
    if old not in text:
        raise SystemExit(f"{label}: pattern not found in {path}")
    target.write_text(text.replace(old, new, 1))


replace_once(
    "ventas/screens/sales-screen.tsx",
    "  const cardStep = cardWidth + planCardGap;\n",
    "  const cardStep = cardWidth + planCardGap;\n  const compactPlanCard = cardWidth < 288;\n",
    "compact plan threshold",
)
replace_once(
    "ventas/screens/sales-screen.tsx",
    "                      compact={isPhone}\n",
    "                      compact={compactPlanCard}\n",
    "plan card compact prop",
)
replace_once(
    "ventas/screens/sales/components/plan-card.tsx",
    "  const compactCard = compact || width <= 316;\n",
    "  const compactCard = compact;\n",
    "single compact source",
)

Path("ventas/scripts/verify-mobile-sales-layout.cjs").write_text(
    """const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const screen = fs.readFileSync(path.resolve(__dirname, '../screens/sales-screen.tsx'), 'utf8');
const styles = fs.readFileSync(path.resolve(__dirname, '../screens/sales/styles.ts'), 'utf8');
const card = fs.readFileSync(path.resolve(__dirname, '../screens/sales/components/plan-card.tsx'), 'utf8');

// Mobile keeps one full-width card and preserves desktop-scale visual hierarchy
// on standard phones. Compact mode is reserved for viewports narrower than 320 px.
assert.match(screen, /const planCardGap = isPhone \\? 12 : 18/);
assert.match(screen, /Math\\.max\\(0, width - 32\\)/);
assert.match(screen, /const compactPlanCard = cardWidth < 288/);
assert.match(screen, /compact=\\{compactPlanCard\\}/);
assert.doesNotMatch(screen, /compact=\\{isPhone\\}/);
assert.match(screen, /styles\\.planCarouselViewportPhone/);
assert.match(screen, /styles\\.planCarouselPhone/);
assert.match(styles, /planCarouselViewportPhone:/);
assert.match(styles, /planCarouselPhone:/);
assert.match(styles, /overflowX: 'hidden'/);
assert.match(card, /const compactCard = compact;/);
assert.doesNotMatch(card, /width <= 316/);
assert.match(card, /compactCard \\? \\{ fontSize: 24, lineHeight: 28 \\} : undefined/);
assert.match(card, /compactCard \\? \\{ fontSize: 34, lineHeight: 40 \\} : undefined/);

// Desktop uses an exact 3/4-card viewport with no negative edge reveal.
assert.match(screen, /const desktopVisibleCards = width >= 1320 \\? 4 : 3/);
assert.match(screen, /Math\\.min\\(width, 1240\\) - 44/);
assert.match(screen, /desktopCarouselWidth - planCardGap \\* \\(desktopVisibleCards - 1\\)/);
assert.match(screen, /getPlanScrollOffset/);
assert.match(screen, /styles\\.planCarouselViewportDesktop/);
assert.match(screen, /styles\\.planCarouselDesktop/);
assert.match(styles, /planCarouselViewportDesktop:[\\s\\S]*marginHorizontal: 0,[\\s\\S]*overflow: 'hidden'/);
assert.match(styles, /planCarouselDesktop:[\\s\\S]*paddingLeft: 0,[\\s\\S]*paddingRight: 0/);

console.log('ok - tarjetas de planes conservan ancho y escala visual en movil y escritorio');
"""
)

old_test = """  test('landing conserva jerarquía comercial y acciones de planes', async ({ page }, testInfo) => {
    await page.goto('/ventas', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('ManeComb').first()).toBeVisible();
    await expect(page.getByText('Elige la capacidad de tu flotilla')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Elegir plan' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Usar demo \\d+ días/i }).first()).toBeVisible();
    await assertNoDocumentOverflow(page);
    await attachFullPageScreenshot(page, testInfo, 'landing-planes');
  });"""
new_test = """  test('landing conserva jerarquía comercial y acciones de planes', async ({ page }, testInfo) => {
    await page.goto('/ventas', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('ManeComb').first()).toBeVisible();
    await expect(page.getByText('Elige la capacidad de tu flotilla')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Elegir plan' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Usar demo \\d+ días/i }).first()).toBeVisible();

    const firstPlanCard = page.getByRole('button', { name: 'Seleccionar plan 2 combis' });
    await firstPlanCard.scrollIntoViewIfNeeded();
    await expect(firstPlanCard).toBeVisible();

    const viewport = page.viewportSize();
    if (viewport && viewport.width <= 640) {
      const cardBox = await firstPlanCard.boundingBox();
      expect(cardBox, 'La tarjeta móvil debe tener dimensiones medibles').not.toBeNull();
      expect(
        cardBox?.width ?? 0,
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
  });"""
replace_once(
    "mobile/e2e/certification/public-responsive.spec.ts",
    old_test,
    new_test,
    "mobile visual certification",
)
