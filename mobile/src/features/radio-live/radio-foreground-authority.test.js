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

describe('Radio single operational authority', () => {
  it('keeps transport, capture and playback out of the Radio screen', () => {
    const screen = source('../../screens/radio/radio-screen-view.tsx');

    for (const forbidden of [
      'RadioRealtimeService',
      'getSharedRealtimeSocket',
      'startPttAudioCapture',
      'stopPttAudioCapture',
      'startPttAudioPlayback',
      'enqueuePttAudioFrame',
      'subscribeToPttAudioFrames',
      'radioSessionReducer',
    ]) {
      expect(screen).not.toContain(forbidden);
    }
  });

  it('leaves exactly one owner of the Radio transport', () => {
    const runtime = source('./radio-live-runtime.ts');
    expect(runtime).toContain('new RadioRealtimeService(');

    const featureDir = path.resolve(__dirname, '../..');
    const owners = [];
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(entryPath);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || entry.name.includes('.test.')) continue;
        if (fs.readFileSync(entryPath, 'utf8').includes('new RadioRealtimeService(')) {
          owners.push(path.relative(featureDir, entryPath).replace(/\\/g, '/'));
        }
      }
    };
    walk(featureDir);

    expect(owners).toEqual(['features/radio-live/radio-live-runtime.ts']);
  });

  it('removes the global suspension flag replaced by pause(call)', () => {
    const transport = source('./radio-realtime-service.ts');
    expect(transport).not.toContain('setRadioRealtimeSuspended');
    expect(transport).not.toContain('radioRealtimeSuspended');
    expect(source('./radio-live-overlay.tsx')).toContain("pause('call')");
  });

  it('never pauses the runtime because the Radio screen is mounted', () => {
    const overlay = source('./radio-live-overlay.tsx');
    expect(overlay).not.toContain('PAUSED_BY_SCREEN');
    expect(overlay).not.toContain("pause('screen')");
    expect(overlay).not.toContain('screenOwnsRadio');
  });
});
