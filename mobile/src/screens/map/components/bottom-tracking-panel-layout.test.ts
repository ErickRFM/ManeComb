const fs = require('fs');
const path = require('path');
const nodeProcess = require('process');

export {};

describe('geometria de BottomTrackingPanel', () => {
  const mobileRoot = nodeProcess.cwd();
  const panel = fs.readFileSync(
    path.join(mobileRoot, 'src', 'screens', 'map', 'components', 'BottomTrackingPanel.tsx'),
    'utf8'
  );
  const styles = fs.readFileSync(
    path.join(mobileRoot, 'src', 'screens', 'map', 'map-styles.ts'),
    'utf8'
  );

  it('mantiene acciones fuera del scroll y revela la seccion activada', () => {
    const scrollClose = panel.indexOf('</ScrollView>', panel.indexOf('ref={expandedScrollRef}'));
    const actionRow = panel.indexOf('styles.panelActionRow', scrollClose);

    expect(scrollClose).toBeGreaterThan(0);
    expect(actionRow).toBeGreaterThan(scrollClose);
    expect(panel).toContain("onLayout={(event) => handleSectionLayout('details', event.nativeEvent.layout.y)}");
    expect(panel).toContain("onLayout={(event) => handleSectionLayout('history', event.nativeEvent.layout.y)}");
    expect(panel).toContain('y: Math.max(0, y - SECTION_REVEAL_MARGIN)');
    expect(panel).not.toContain('scrollToEnd');
  });

  it('restaura el scroll al cambiar unidad y expone estado activo accesible', () => {
    expect(panel).toContain('expandedScrollRef.current?.scrollTo({ y: 0, animated: false })');
    expect(panel).toContain('accessibilityState={{ expanded: detailsOpen, selected: detailsOpen }}');
    expect(panel).toContain('accessibilityState={{ expanded: historyOpen, selected: historyOpen }}');
  });

  it('reserva espacio inferior y evita que acciones o scroll desborden el card', () => {
    expect(styles).toContain('expandedPanelScroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 }');
    expect(styles).toContain('expandedPanelContent: { gap: 8, paddingBottom: 16 }');
    expect(styles).toContain('panelActionRow: { flexDirection: \'row\', flexShrink: 0');
  });

  it('evita overscroll y no anida un ScrollView horizontal para cero o una unidad', () => {
    expect(panel).toContain('alwaysBounceVertical={false}');
    expect(panel).toContain('alwaysBounceHorizontal={false}');
    expect(panel).toContain('overScrollMode="never"');
    expect(panel).toContain('trackingUnits.length <= 1 ? <View');
    expect(panel).not.toContain('trackingUnits.length <= 1 ? <ScrollView');
  });

  it('reserva un viewport vertical para que las pestanas no se recorten en Android estrecho', () => {
    expect(panel).toContain('responsiveStyles.trackScrollerStable');
    expect(panel).toContain('responsiveStyles.trackListStable');
    expect(panel).toContain('minHeight: 42');
    expect(panel).toContain('paddingVertical: 2');
    expect(panel).toContain('marginHorizontal: -10');
    expect(panel).toContain('paddingHorizontal: 10');
  });

  it('hace que el panel siga el dedo y haga snap por distancia o velocidad', () => {
    expect(panel).toContain('Animated.View');
    expect(panel).toContain('onPanResponderMove');
    expect(panel).toContain('panelDragY.setValue');
    expect(panel).toContain('Animated.spring(panelDragY');
    expect(panel).toContain('translateY: panelDragY');
    expect(panel).toContain('PANEL_DRAG_TRIGGER');
    expect(panel).toContain('PANEL_FLING_VELOCITY');
  });
});
