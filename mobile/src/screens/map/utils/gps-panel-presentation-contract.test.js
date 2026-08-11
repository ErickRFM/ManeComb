const fs = require('node:fs');
const path = require('node:path');

const panelPath = path.resolve(__dirname, '../components/BottomTrackingPanel.tsx');
const panel = fs.readFileSync(panelPath, 'utf8');

describe('remote GPS panel presentation contract', () => {
  it('colors the selected unit from its canonical connection state, not local device GPS', () => {
    expect(panel).toContain("selectedUnit.gps.connectionState === 'live'");
    expect(panel).toContain("selectedUnit.gps.connectionState === 'delayed'");
    expect(panel).toContain("selectedUnit.gps.connectionState === 'stale'");
    expect(panel).toContain('color={gpsStatusColor}');
    expect(panel).not.toContain('name="crosshairs-gps" size={16} color={locationStatusColor}');
  });

  it('never paints an unknown operational state as positive', () => {
    expect(panel).toContain("selectedUnit?.operationalState === 'on_route'");
    expect(panel).toContain("selectedUnit?.operationalState === 'stopped'");
    expect(panel).toContain("selectedUnit?.operationalState === 'maintenance'");
    expect(panel).toMatch(/operationalState === 'maintenance'[\s\S]*?: 'neutral';/);
    expect(panel).not.toContain("selectedUnit?.status === 'offline'");
  });
});
