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
});
