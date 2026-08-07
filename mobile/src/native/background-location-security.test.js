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
    const credentials = source('../../android/app/src/main/java/com/anonymous/combiscontrol/location/ManeCombLocationCredentials.kt');
    expect(credentials).toContain('AndroidKeyStore');
    expect(credentials).toContain('AES/GCM/NoPadding');
    expect(credentials).toContain('KeyGenParameterSpec');
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
