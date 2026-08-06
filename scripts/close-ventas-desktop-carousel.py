from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    text = target.read_text()
    if old not in text:
        raise SystemExit(f"{label}: pattern not found in {path}")
    target.write_text(text.replace(old, new, 1))


screen_path = "ventas/screens/sales-screen.tsx"
screen = Path(screen_path)
text = screen.read_text()

text = text.replace(
    "import { useEffect, useRef, useState } from 'react';",
    "import { useCallback, useEffect, useRef, useState } from 'react';",
    1,
)

old_sizing = """  const planCardGap = isPhone ? 12 : 18;
  const cardWidth = isPhone
    ? Math.max(0, width - 32)
    : isDesktop
      ? 336
      : 306;
  const cardStep = cardWidth + planCardGap;"""
new_sizing = """  const planCardGap = isPhone ? 12 : 18;
  const desktopVisibleCards = width >= 1320 ? 4 : 3;
  const desktopCarouselWidth = Math.max(0, Math.min(width, 1240) - 44);
  const cardWidth = isPhone
    ? Math.max(0, width - 32)
    : isDesktop
      ? Math.floor(
          (desktopCarouselWidth - planCardGap * (desktopVisibleCards - 1)) /
            desktopVisibleCards
        )
      : 306;
  const cardStep = cardWidth + planCardGap;"""
if old_sizing not in text:
    raise SystemExit("desktop card sizing block not found")
text = text.replace(old_sizing, new_sizing, 1)

state_anchor = "  const [nativeScrollY, setNativeScrollY] = useState(0);\n"
scroll_helper = """  const [nativeScrollY, setNativeScrollY] = useState(0);

  const getPlanScrollOffset = useCallback(
    (planIndex: number) => {
      if (!isDesktop) {
        return planIndex * cardStep;
      }

      const maxStartIndex = Math.max(0, plans.length - desktopVisibleCards);
      const centeredStartIndex = planIndex - Math.floor(desktopVisibleCards / 2);
      const startIndex = Math.max(0, Math.min(maxStartIndex, centeredStartIndex));
      return startIndex * cardStep;
    },
    [cardStep, desktopVisibleCards, isDesktop, plans.length]
  );
"""
if state_anchor not in text:
    raise SystemExit("sales screen state anchor not found")
text = text.replace(state_anchor, scroll_helper, 1)

old_initial_scroll = """    const frame = requestAnimationFrame(() => {
      carouselRef.current?.scrollTo({
        x: bestValueIndex * cardStep,
        animated: false,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [cardStep, plans]);"""
new_initial_scroll = """    const frame = requestAnimationFrame(() => {
      carouselRef.current?.scrollTo({
        x: getPlanScrollOffset(bestValueIndex),
        animated: false,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [getPlanScrollOffset, plans]);"""
if old_initial_scroll not in text:
    raise SystemExit("initial plan scroll block not found")
text = text.replace(old_initial_scroll, new_initial_scroll, 1)

text = text.replace(
    "carouselRef.current?.scrollTo({ x: activePlanIndex * cardStep, animated: true });",
    "carouselRef.current?.scrollTo({ x: getPlanScrollOffset(activePlanIndex), animated: true });",
    1,
)
text = text.replace(
    "      x: boundedIndex * cardStep,",
    "      x: getPlanScrollOffset(boundedIndex),",
    1,
)

old_loading_styles = """                    styles.planCarousel,
                    isPhone ? styles.planCarouselPhone : undefined,
                    { alignItems: 'flex-start' },"""
new_loading_styles = """                    styles.planCarousel,
                    isPhone ? styles.planCarouselPhone : undefined,
                    isDesktop ? styles.planCarouselDesktop : undefined,
                    isDesktop
                      ? { alignSelf: 'center', width: desktopCarouselWidth }
                      : undefined,
                    { alignItems: 'flex-start' },"""
if old_loading_styles not in text:
    raise SystemExit("loading carousel styles not found")
text = text.replace(old_loading_styles, new_loading_styles, 1)

old_viewport_styles = """                    styles.planCarouselViewport,
                    isPhone ? styles.planCarouselViewportPhone : undefined,
                  ]}"""
new_viewport_styles = """                    styles.planCarouselViewport,
                    isPhone ? styles.planCarouselViewportPhone : undefined,
                    isDesktop ? styles.planCarouselViewportDesktop : undefined,
                    isDesktop ? { maxWidth: desktopCarouselWidth } : undefined,
                  ]}"""
if old_viewport_styles not in text:
    raise SystemExit("carousel viewport styles not found")
text = text.replace(old_viewport_styles, new_viewport_styles, 1)

old_content_styles = """                    styles.planCarousel,
                    isPhone ? styles.planCarouselPhone : undefined,
                    { alignItems: 'flex-start' },
                  ]}"""
new_content_styles = """                    styles.planCarousel,
                    isPhone ? styles.planCarouselPhone : undefined,
                    isDesktop ? styles.planCarouselDesktop : undefined,
                    { alignItems: 'flex-start' },
                  ]}"""
if old_content_styles not in text:
    raise SystemExit("carousel content styles not found")
text = text.replace(old_content_styles, new_content_styles, 1)
screen.write_text(text)

styles_path = "ventas/screens/sales/styles.ts"
styles = Path(styles_path)
text = styles.read_text()

viewport_phone = """  planCarouselViewportPhone: {
    marginHorizontal: 0,
    marginTop: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
  },"""
viewport_desktop = viewport_phone + """
  planCarouselViewportDesktop: {
    alignSelf: 'center',
    marginHorizontal: 0,
    overflow: 'hidden',
    paddingHorizontal: 0,
    width: '100%',
  },"""
if viewport_phone not in text:
    raise SystemExit("phone carousel viewport style not found")
text = text.replace(viewport_phone, viewport_desktop, 1)

carousel_phone = """  planCarouselPhone: {
    gap: 12,
    paddingBottom: 22,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 8,
  },"""
carousel_desktop = carousel_phone + """
  planCarouselDesktop: {
    gap: 18,
    paddingLeft: 0,
    paddingRight: 0,
  },"""
if carousel_phone not in text:
    raise SystemExit("phone carousel content style not found")
styles.write_text(text.replace(carousel_phone, carousel_desktop, 1))

Path("ventas/scripts/verify-mobile-sales-layout.cjs").write_text(
    """const assert = require('node:assert/strict');
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
"""
)
