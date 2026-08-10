import fs from 'node:fs';
import path from 'node:path';

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

describe('Android background GPS session isolation', () => {
  it('does not persist access or refresh tokens as plaintext SharedPreferences values', () => {
    const service = source('../../android/app/src/main/java/com/anonymous/combiscontrol/location/ManeCombLocationService.kt');
    expect(service).not.toMatch(/putString\(KEY_TOKEN\s*,/);
    expect(service).not.toMatch(/putString\(KEY_REFRESH_TOKEN\s*,/);
  });

  it('encrypts restorable credentials with Android Keystore AES-GCM', () => {
    // La cripto vive en el almacen seguro compartido; GPS la consume con su
    // propio alias, de modo que borrar Radio no invalida las credenciales de GPS.
    const secureStore = source('../../android/app/src/main/java/com/anonymous/combiscontrol/security/ManeCombSecureStore.kt');
    expect(secureStore).toContain('AndroidKeyStore');
    expect(secureStore).toContain('AES/GCM/NoPadding');
    expect(secureStore).toContain('KeyGenParameterSpec');

    const credentials = source('../../android/app/src/main/java/com/anonymous/combiscontrol/location/ManeCombLocationCredentials.kt');
    expect(credentials).toContain('ManeCombSecureStore.encrypt');
    expect(credentials).toContain('ManeCombSecureStore.decrypt');
    expect(credentials).toContain('manecomb-location-credentials-v1');
    expect(credentials).not.toMatch(/putString\(KEY_TOKEN_ENCRYPTED\s*,\s*token\)/);
  });

  it('never puts the native Radio session token at rest', () => {
    const radioCredentials = source('../../android/app/src/main/java/com/anonymous/combiscontrol/audio/RadioCredentials.kt');
    // El servicio es START_NOT_STICKY y React lo reactiva en cada arranque: un
    // token en disco no tendria consumidor y solo seria superficie de ataque.
    expect(radioCredentials).not.toContain('SharedPreferences');
    expect(radioCredentials).not.toContain('getSharedPreferences');
    expect(radioCredentials).not.toContain('ManeCombSecureStore');
    // toString no puede filtrar el token en un log o en un crash report.
    expect(radioCredentials).toContain('token=***');
  });

  it('keeps every Radio secret out of the logs', () => {
    const radioLog = source('../../android/app/src/main/java/com/anonymous/combiscontrol/audio/RadioLog.kt');
    expect(radioLog).toContain('FORBIDDEN_KEYS');
    for (const forbidden of ['token', 'auth', 'data', 'audio', 'password', 'secret']) {
      expect(radioLog).toContain(`"${forbidden}"`);
    }

    const radioSources = [
      'RadioSessionController',
      'SocketIoRadioTransport',
      'ManeCombRadioService',
      'RadioAudioSession',
    ].map((name) => source(`../../android/app/src/main/java/com/anonymous/combiscontrol/audio/${name}.kt`));

    for (const radioSource of radioSources) {
      expect(radioSource).not.toMatch(/RadioLog\.[a-z]+\([^)]*\btoken\b/i);
      expect(radioSource).not.toMatch(/RadioLog\.[a-z]+\([^)]*base64/i);
      expect(radioSource).not.toMatch(/Log\.[a-z]\([^)]*\btoken\b/i);
    }
  });

  it('has a non-flushing hard stop and isolates persisted queues by vehicle', () => {
    const module = source('../../android/app/src/main/java/com/anonymous/combiscontrol/location/ManeCombLocationModule.kt');
    const service = source('../../android/app/src/main/java/com/anonymous/combiscontrol/location/ManeCombLocationService.kt');
    expect(module).toContain('hardStopService');
    expect(service).toContain('hardResetPersistedState');
    expect(service).toContain('KEY_PENDING_OWNER_VEHICLE_ID');
    expect(service).toContain('pendingLocations.clear()');
  });

  it('reports current queue age without mutating the persisted GPS packet', () => {
    const service = source('../../android/app/src/main/java/com/anonymous/combiscontrol/location/ManeCombLocationService.kt');
    expect(service).toContain('val uploadBody = JSONObject(body.toString())');
    expect(service).toContain('val capturedAt = uploadBody.optLong("timestamp", 0L)');
    expect(service).toContain('uploadBody.put("clientQueueAgeMs", queueAgeMs)');
    expect(service).toContain('writer.write(uploadBody.toString())');
    expect(service).not.toContain('body.put("clientQueueAgeMs"');
  });
});