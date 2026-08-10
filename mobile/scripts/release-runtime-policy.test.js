const fs = require('fs');
const path = require('path');
const {
  buildReleaseEnvironment,
  validateReleaseRuntime,
} = require('./release-runtime-policy');

const firebaseEnv = {
  MANECOMB_FIREBASE_PROJECT_ID: 'manecomb-prod',
  MANECOMB_FIREBASE_APP_ID: '1:123:android:abc',
  MANECOMB_FIREBASE_API_KEY: 'firebase-api-key',
  MANECOMB_FIREBASE_SENDER_ID: '123',
};

function parseEnvFile(filePath) {
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      })
  );
}

function validEnvironment(overrides = {}) {
  return buildReleaseEnvironment({
    processEnv: {
      MAPBOX_ACCESS_TOKEN: 'pk.test-public-token',
      ...firebaseEnv,
    },
    productionEnv: overrides,
  });
}

describe('Android release runtime policy', () => {
  it('acepta Firebase y Mapbox inyectados por variables del proceso', () => {
    const env = validEnvironment();
    expect(validateReleaseRuntime(env)).toEqual({ firebaseConfigured: true });
  });

  it('acepta google-services.json como autoridad Firebase alternativa', () => {
    const env = buildReleaseEnvironment({
      processEnv: { MAPBOX_ACCESS_TOKEN: 'pk.test-public-token' },
    });
    expect(validateReleaseRuntime(env, { googleServicesExists: true })).toEqual({
      firebaseConfigured: true,
    });
  });

  it('falla cerrado si FCM no esta configurado', () => {
    const env = buildReleaseEnvironment({
      processEnv: { MAPBOX_ACCESS_TOKEN: 'pk.test-public-token' },
    });
    expect(() => validateReleaseRuntime(env)).toThrow('FCM es obligatorio para Release');
  });

  it('falla cerrado si Mapbox no esta configurado', () => {
    const env = buildReleaseEnvironment({ processEnv: firebaseEnv });
    expect(() => validateReleaseRuntime(env)).toThrow('MAPBOX_ACCESS_TOKEN publico es obligatorio');
  });

  it('no permite desactivar FCM ni cleartext policy desde production env', () => {
    expect(() => validateReleaseRuntime(validEnvironment({ MANECOMB_REQUIRE_FCM: '0' }))).toThrow(
      'MANECOMB_REQUIRE_FCM=1'
    );
    expect(() => validateReleaseRuntime(validEnvironment({ MANECOMB_ANDROID_CLEARTEXT: '1' }))).toThrow(
      'MANECOMB_ANDROID_CLEARTEXT=0'
    );
  });

  it('no permite endpoints HTTP en Release', () => {
    expect(() => validateReleaseRuntime(validEnvironment({ MANECOMB_API_URL: 'http://10.0.2.2:5000/api' }))).toThrow(
      'MANECOMB_API_URL debe usar HTTPS'
    );
  });

  it('el .env.production versionado cumple el gate de Release', () => {
    const productionEnv = parseEnvFile(path.resolve(__dirname, '..', '.env.production'));
    const env = buildReleaseEnvironment({
      processEnv: {
        MAPBOX_ACCESS_TOKEN: 'pk.test-public-token',
        ...firebaseEnv,
      },
      productionEnv,
    });

    expect(productionEnv.MANECOMB_REQUIRE_FCM).toBe('1');
    expect(() => validateReleaseRuntime(env)).not.toThrow();
  });
});
