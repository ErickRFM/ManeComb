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

  it('keeps the native Radio session token encrypted and separate from GPS', () => {
    const radioCredentials = source('../../android/app/src/main/java/com/anonymous/combiscontrol/audio/RadioCredentials.kt');
    expect(radioCredentials).toContain('ManeCombSecureStore.encrypt');
    expect(radioCredentials).toContain('manecomb-radio-credentials-v1');
    // El token nunca se guarda en claro ni se escribe en logs.
    expect(radioCredentials).not.toMatch(/putString\(KEY_TOKEN_ENCRYPTED\s*,\s*credentials\.token\)/);
    expect(radioCredentials).not.toMatch(/Log\.[a-z]+\([^)]*token/i);
  });

  it('has a non-flushing hard stop and isolates persisted queues by vehicle', () => {
    const module = source('../../android/app/src/main/java/com/anonymous/combiscontrol/location/ManeCombLocationModule.kt');
    const service = source('../../android/app/src/main/java/com/anonymous/combiscontrol/location/ManeCombLocationService.kt');
    expect(module).toContain('hardStopService');
    expect(service).toContain('hardResetPersistedState');
    expect(service).toContain('KEY_PENDING_OWNER_VEHICLE_ID');
    expect(service).toContain('pendingLocations.clear()');
  });
});
