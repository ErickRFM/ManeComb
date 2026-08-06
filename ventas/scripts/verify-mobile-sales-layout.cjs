const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const screen = fs.readFileSync(path.resolve(__dirname, '../screens/sales-screen.tsx'), 'utf8');
const styles = fs.readFileSync(path.resolve(__dirname, '../screens/sales/styles.ts'), 'utf8');
const card = fs.readFileSync(path.resolve(__dirname, '../screens/sales/components/plan-card.tsx'), 'utf8');

// Mobile keeps one full card per viewport and one canonical gap.
assert.match(screen, /const planCardGap = isPhone \? 12 : 18/);
assert.match(screen, /Math\.max\(0, width - 32\)/);
assert.match(screen, /compact=\{isPhone\}/);
assert.match(screen, /styles\.planCarouselViewportPhone/);
assert.match(screen, /styles\.planCarouselPhone/);
assert.match(styles, /planCarouselViewportPhone:/);
assert.match(styles, /planCarouselPhone:/);
assert.match(styles, /overflowX: 'hidden'/);
assert.match(card, /compact \|\| width <= 316/);

// Desktop uses an exact 3/4-card viewport with no negative edge reveal.
assert.match(screen, /const desktopVisibleCards = width >= 1320 \? 4 : 3/);
assert.match(screen, /Math\.min\(width, 1240\) - 44/);
assert.match(screen, /desktopCarouselWidth - planCardGap \* \(desktopVisibleCards - 1\)/);
assert.match(screen, /getPlanScrollOffset/);
assert.match(screen, /styles\.planCarouselViewportDesktop/);
assert.match(screen, /styles\.planCarouselDesktop/);
assert.match(styles, /planCarouselViewportDesktop:[\s\S]*marginHorizontal: 0,[\s\S]*overflow: 'hidden'/);
assert.match(styles, /planCarouselDesktop:[\s\S]*paddingLeft: 0,[\s\S]*paddingRight: 0/);

console.log('ok - carrusel de planes muestra tarjetas completas en movil y escritorio');
