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
    expect(panel).toContain('onContentSizeChange={handleExpandedContentSizeChange}');
    expect(panel).toContain('expandedScrollRef.current?.scrollToEnd');
  });

  it('restaura el scroll al cambiar unidad y expone estado activo accesible', () => {
    expect(panel).toContain('expandedScrollRef.current?.scrollTo({ y: 0, animated: false })');
    expect(panel).toContain('accessibilityState={{ expanded: detailsOpen, selected: detailsOpen }}');
    expect(panel).toContain('accessibilityState={{ expanded: historyOpen, selected: historyOpen }}');
  });

  it('reserva espacio inferior y evita que acciones o scroll desborden el card', () => {
    expect(styles).toContain('expandedPanelScroll: { flexGrow: 0, flexShrink: 1 }');
    expect(styles).toContain('expandedPanelContent: { gap: 8, paddingBottom: 16 }');
    expect(styles).toContain('panelActionRow: { flexDirection: \'row\', flexShrink: 0');
  });
});
