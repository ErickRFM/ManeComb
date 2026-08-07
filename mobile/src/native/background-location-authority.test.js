import fs from 'node:fs';
import path from 'node:path';

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

describe('background GPS authority boundaries', () => {
  it('keeps App and MapScreen out of native service start/stop authority', () => {
    const app = source('../../App.tsx');
    const map = source('../screens/map-screen.native.tsx');

    for (const text of [app, map]) {
      expect(text).not.toContain('startBackgroundLocationServiceAsync');
      expect(text).not.toContain('stopBackgroundLocationServiceAsync');
      expect(text).not.toContain('acquireBackgroundLocationServiceAsync');
      expect(text).not.toContain('releaseBackgroundLocationServiceAsync');
    }
  });

  it('keeps the operational runtime as the single service owner', () => {
    const bridge = source('./background-location.ts');
    const engine = source('../screens/map/hooks/use-location-engine.ts');
    expect(bridge).toContain("export type BackgroundLocationServiceOwner = 'operational-runtime'");
    expect(engine).toContain("const BACKGROUND_OWNER = 'operational-runtime' as const");
  });

  it('hard-stops GPS before waiting for remote logout', () => {
    const store = source('../store/root-store.ts');
    const start = store.indexOf('signOut: async () => {');
    const hardStop = store.indexOf('await hardResetBackgroundLocationServiceAsync()', start);
    const remoteLogout = store.indexOf('await logoutRequest', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(hardStop).toBeGreaterThan(start);
    expect(remoteLogout).toBeGreaterThan(hardStop);
  });
});
