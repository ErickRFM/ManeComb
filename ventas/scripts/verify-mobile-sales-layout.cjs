const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const screen = fs.readFileSync(path.resolve(__dirname, '../screens/sales-screen.tsx'), 'utf8');
const styles = fs.readFileSync(path.resolve(__dirname, '../screens/sales/styles.ts'), 'utf8');
const card = fs.readFileSync(path.resolve(__dirname, '../screens/sales/components/plan-card.tsx'), 'utf8');

// Mobile keeps one full-width card and preserves desktop-scale visual hierarchy
// on standard 360 px phones. The card may also compact itself when its real
// rendered width is narrow, which is needed by the denser desktop comparison.
assert.match(screen, /const planCardGap = isPhone \? 12 : 18/);
assert.match(screen, /Math\.max\(0, width - 32\)/);
assert.match(screen, /const compactPlanCard = cardWidth < 288/);
assert.match(screen, /compact=\{compactPlanCard\}/);
assert.match(screen, /styles\.planCarouselViewportPhone/);
assert.match(screen, /styles\.planCarouselPhone/);
assert.match(styles, /planCarouselViewportPhone:/);
assert.match(styles, /planCarouselPhone:/);
assert.match(styles, /overflowX: 'hidden'/);
assert.match(card, /const compactCard = compact \|\| width < 312;/);
assert.match(card, /const planListMinHeight = compactCard \? 96 : 106;/);
assert.match(card, /const cardMinHeight = showTrialAction/);
assert.match(card, /minHeight: cardMinHeight/);
assert.match(card, /\{ minHeight: planListMinHeight, flexShrink: 0 \}/);
assert.match(card, /styles\.planActions, \{ gap: 9, flexShrink: 0, width: '100%' \}/);
assert.match(card, /compactCard \? \{ fontSize: 24, lineHeight: 28 \} : undefined/);
assert.match(card, /compactCard \? \{ fontSize: 34, lineHeight: 40 \} : undefined/);

// Desktop prioritizes comparison: up to five cards are visible on wide screens,
// four on standard desktop, and controls disappear when the full catalog fits.
assert.match(screen, /const desktopVisibleCards = width >= 1180 \? 5 : width >= 1024 \? 4 : 3/);
assert.match(screen, /const showPlanControls = !isDesktop \|\| plans\.length > desktopVisibleCards/);
assert.match(screen, /Math\.min\(width, 1240\) - 44/);
assert.match(screen, /desktopCarouselWidth - planCardGap \* \(desktopVisibleCards - 1\)/);
assert.match(screen, /getPlanScrollOffset/);
assert.match(screen, /styles\.planCarouselViewportDesktop/);
assert.match(screen, /styles\.planCarouselDesktop/);
assert.match(styles, /planCarouselViewportDesktop:[\s\S]*marginHorizontal: 0,[\s\S]*overflow: 'hidden'/);
assert.match(styles, /planCarouselDesktop:[\s\S]*paddingLeft: 0,[\s\S]*paddingRight: 0/);

console.log('ok - tarjetas de planes conservan escala, espacio interno y comparación en movil y escritorio');