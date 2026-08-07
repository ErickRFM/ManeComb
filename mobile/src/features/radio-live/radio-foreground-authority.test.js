const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

describe('Radio foreground service authority boundaries', () => {
  it('keeps native foreground start/stop out of RadioScreen and runtime', () => {
    const screen = source('../../screens/radio/radio-screen-view.tsx');
    const runtime = source('./radio-live-runtime.ts');

    for (const text of [screen, runtime]) {
      expect(text).not.toContain('startRadioForegroundService');
      expect(text).not.toContain('stopRadioForegroundService');
    }
  });

  it('allows only the coordinator to consume the native foreground bridge', () => {
    const coordinator = source('./radio-foreground-service.ts');
    expect(coordinator).toContain('startRadioForegroundService');
    expect(coordinator).toContain('stopRadioForegroundService');
    expect(coordinator).not.toContain('SCREEN_HANDOFF_RESTART_MS');
    expect(coordinator).not.toContain('pendingRestart');
  });
});
