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

  it('keeps packet identity and capture time stable across queue retries', () => {
    const service = source('../../android/app/src/main/java/com/anonymous/combiscontrol/location/ManeCombLocationService.kt');
    const post = service.slice(
      service.indexOf('private fun postLocation'),
      service.indexOf('private fun refreshAccessToken')
    );
    expect(post).toContain('val uploadBody = JSONObject(body.toString())');
    expect(post).toContain('val capturedAt = uploadBody.optLong("timestamp", 0L)');
    expect(post).toContain('val packetId = uploadBody.optString("packetId", "")');
    expect(post).toContain('postLocation(body, false)');
    expect(post).not.toContain('body.put("timestamp"');
    expect(post.indexOf('val sentAt = System.currentTimeMillis()')).toBeLessThan(
      post.indexOf('val responseCode = connection.responseCode')
    );
  });

  it('anchors a headless pending journey to the oldest matching queued capture', () => {
    const service = source('../../android/app/src/main/java/com/anonymous/combiscontrol/location/ManeCombLocationService.kt');
    const startBoundary = service.slice(
      service.indexOf('private fun pendingSessionStartedAt'),
      service.indexOf('private fun postLocation')
    );

    expect(startBoundary).toContain('sessionId.startsWith("pending:")');
    expect(startBoundary).toContain('packet.optString("sessionId", "") == sessionId');
    expect(startBoundary).toContain('packet.optLong("timestamp", 0L)');
    expect(startBoundary).toContain('.minOrNull()');
    expect(startBoundary).toContain('val startPayload = JSONObject().put("vehicleId", vehicleId)');
    expect(startBoundary).toContain('pendingSessionStartedAt()?.let { capturedAt ->');
    expect(startBoundary).toContain('startPayload.put("startedAt", capturedAt)');
    expect(startBoundary).toContain('writer.write(startPayload.toString())');
  });
});
