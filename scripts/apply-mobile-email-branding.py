from pathlib import Path
import json
import re


def replace_once(path, old, new, label):
    target = Path(path)
    text = target.read_text()
    if old not in text:
        raise SystemExit(f"{label}: pattern not found in {path}")
    target.write_text(text.replace(old, new, 1))


# Mobile sales cards: derive the card from the real phone viewport and use one spacing contract.
sales_path = Path("ventas/screens/sales-screen.tsx")
sales = sales_path.read_text()
replace_once(
    sales_path,
    """  const cardWidth = isPhone
    ? Math.max(240, Math.min(316, width - 48))
    : isDesktop
      ? 336
      : 306;
  const cardStep = cardWidth + 18;""",
    """  const planCardGap = isPhone ? 12 : 18;
  const cardWidth = isPhone
    ? Math.max(0, width - 32)
    : isDesktop
      ? 336
      : 306;
  const cardStep = cardWidth + planCardGap;""",
    "phone card width contract",
)
sales = sales_path.read_text()
sales = sales.replace(
    """                <View style={[styles.planCarousel, { alignItems: 'flex-start' }]}>""",
    """                <View
                  style={[
                    styles.planCarousel,
                    isPhone ? styles.planCarouselPhone : undefined,
                    { alignItems: 'flex-start' },
                  ]}>""",
    1,
)
sales = sales.replace(
    """                  style={styles.planCarouselViewport}
                  snapToInterval={cardStep}""",
    """                  style={[
                    styles.planCarouselViewport,
                    isPhone ? styles.planCarouselViewportPhone : undefined,
                  ]}
                  snapToInterval={cardStep}""",
    1,
)
sales = sales.replace(
    """                  contentContainerStyle={[styles.planCarousel, { alignItems: 'flex-start' }]}""",
    """                  contentContainerStyle={[
                    styles.planCarousel,
                    isPhone ? styles.planCarouselPhone : undefined,
                    { alignItems: 'flex-start' },
                  ]}""",
    1,
)
sales = sales.replace(
    """                      width={cardWidth}
                      active={activePlanIndex === index}""",
    """                      width={cardWidth}
                      compact={isPhone}
                      active={activePlanIndex === index}""",
    1,
)
if "compact={isPhone}" not in sales:
    raise SystemExit("PlanCard compact mobile prop was not inserted")
sales_path.write_text(sales)

# PlanCard owns compact typography/padding explicitly instead of guessing from width.
plan_path = Path("ventas/screens/sales/components/plan-card.tsx")
plan = plan_path.read_text()
plan = plan.replace(
    """  width,
  active,""",
    """  width,
  compact = false,
  active,""",
    1,
)
plan = plan.replace(
    """  width: number;
  active: boolean;""",
    """  width: number;
  compact?: boolean;
  active: boolean;""",
    1,
)
plan = plan.replace(
    """  const compactCard = width <= 316;""",
    """  const compactCard = compact || width <= 316;""",
    1,
)
if "compact?: boolean;" not in plan or "compact || width <= 316" not in plan:
    raise SystemExit("PlanCard compact contract was not applied")
plan_path.write_text(plan)

styles_path = Path("ventas/screens/sales/styles.ts")
styles = styles_path.read_text()
styles = styles.replace(
    """  webPage: {
    minHeight: '100vh' as any,
    width: '100%',
  },""",
    """  webPage: {
    minHeight: '100vh' as any,
    overflowX: 'hidden' as any,
    width: '100%',
  },""",
    1,
)
old_carousel = """  planCarouselViewport: {
    marginHorizontal: -18,
    marginTop: -18,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  planCarousel: {
    gap: 18,
    paddingLeft: 18,
    paddingRight: 30,
    paddingTop: 18,
    paddingBottom: 34,
  },"""
new_carousel = """  planCarouselViewport: {
    alignSelf: 'stretch',
    marginHorizontal: -18,
    marginTop: -18,
    maxWidth: '100%' as any,
    paddingHorizontal: 18,
    paddingTop: 18,
    width: '100%',
  },
  planCarouselViewportPhone: {
    marginHorizontal: 0,
    marginTop: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  planCarousel: {
    gap: 18,
    paddingLeft: 18,
    paddingRight: 30,
    paddingTop: 18,
    paddingBottom: 34,
  },
  planCarouselPhone: {
    gap: 12,
    paddingBottom: 22,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 8,
  },"""
if old_carousel not in styles:
    raise SystemExit("sales carousel style block not found")
styles_path.write_text(styles.replace(old_carousel, new_carousel, 1))

# Produce the exact ManeComb wordmark from the source SVG during the workflow.
brand = Path("ventas/src/components/brand-logo.tsx").read_text()
match = re.search(r"const lightLogoXml = `(<svg.*?</svg>)`;", brand, flags=re.S)
if not match:
    raise SystemExit("ManeComb SVG wordmark source not found")
Path("tmp-logo-email.svg").write_text(match.group(1))

# Keep both communication implementations aligned with the published asset.
for component_path in (
    "communication-service/src/templates/components.js",
    "backend/modules/communication/templates/components.js",
):
    component = Path(component_path)
    text = component.read_text()
    text = text.replace('width="160"', 'width="200"', 1)
    text = text.replace(
        'style="display: block; width: 160px; height: auto; border: 0; outline: none;"',
        'style="display: block; width: 200px; height: auto; border: 0; border-radius: 10px; outline: none; background-color: #050816;"',
        1,
    )
    if 'width="200"' not in text or "border-radius: 10px" not in text:
        raise SystemExit(f"email logo markup was not updated in {component_path}")
    component.write_text(text)

# Permanent regression checks for mobile layout.
Path("ventas/scripts").mkdir(parents=True, exist_ok=True)
Path("ventas/scripts/verify-mobile-sales-layout.cjs").write_text(
    """const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const screen = fs.readFileSync(path.resolve(__dirname, '../screens/sales-screen.tsx'), 'utf8');
const styles = fs.readFileSync(path.resolve(__dirname, '../screens/sales/styles.ts'), 'utf8');
const card = fs.readFileSync(path.resolve(__dirname, '../screens/sales/components/plan-card.tsx'), 'utf8');

assert.match(screen, /const planCardGap = isPhone \? 12 : 18/);
assert.match(screen, /Math\.max\(0, width - 32\)/);
assert.match(screen, /compact=\{isPhone\}/);
assert.match(screen, /styles\.planCarouselViewportPhone/);
assert.match(screen, /styles\.planCarouselPhone/);
assert.match(styles, /planCarouselViewportPhone:/);
assert.match(styles, /planCarouselPhone:/);
assert.match(styles, /overflowX: 'hidden'/);
assert.match(card, /compact \|\| width <= 316/);
console.log('ok - tarjetas de planes respetan el ancho movil y un solo contrato de espaciado');
"""
)

ventas_package = Path("ventas/package.json")
ventas_data = json.loads(ventas_package.read_text())
ventas_data["scripts"]["verify:mobile-layout"] = "node scripts/verify-mobile-sales-layout.cjs"
ventas_data["scripts"]["build"] = "npm run verify:mobile-layout && vite build"
ventas_package.write_text(json.dumps(ventas_data, indent=2, ensure_ascii=False) + "\n")

# Permanent regression checks for the actual wordmark asset used by email.
Path("communication-service/tests/email-branding.test.js").write_text(
    """const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const assetPath = path.join(root, 'ventas/public/logo-email.png');
const standalone = fs.readFileSync(
  path.join(root, 'communication-service/src/templates/components.js'),
  'utf8'
);
const embedded = fs.readFileSync(
  path.join(root, 'backend/modules/communication/templates/components.js'),
  'utf8'
);

assert.ok(fs.existsSync(assetPath), 'Debe existir el wordmark publicado para los correos');
const asset = fs.readFileSync(assetPath);
assert.equal(asset.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.ok(asset.length > 2000, 'El PNG del logo no debe estar vacio');
for (const template of [standalone, embedded]) {
  assert.match(template, /https:\/\/manecomb1\.pages\.dev\/logo-email\.png/);
  assert.match(template, /width=\"200\"/);
  assert.match(template, /border-radius: 10px/);
}
console.log('ok - correos usan el wordmark real y publicado de ManeComb');
"""
)

communication_package = Path("communication-service/package.json")
communication_data = json.loads(communication_package.read_text())
base_test = "node --require ./tests/setup-env.js tests/communication.test.js"
communication_data["scripts"]["test"] = f"{base_test} && node tests/email-branding.test.js"
communication_package.write_text(json.dumps(communication_data, indent=2, ensure_ascii=False) + "\n")
