'use strict';

const PRODUCTION_DEFAULTS = Object.freeze({
  MANECOMB_APP_ENV: 'production',
  MANECOMB_API_URL: 'https://manecomb.onrender.com/api',
  MANECOMB_SOCKET_URL: 'https://manecomb.onrender.com',
  MANECOMB_API_TIMEOUT_MS: '15000',
  MANECOMB_ANDROID_CLEARTEXT: '0',
  MANECOMB_REQUIRE_FCM: '1',
});

const FIREBASE_KEYS = Object.freeze([
  'MANECOMB_FIREBASE_PROJECT_ID',
  'MANECOMB_FIREBASE_APP_ID',
  'MANECOMB_FIREBASE_API_KEY',
  'MANECOMB_FIREBASE_SENDER_ID',
]);

function hasManualFirebaseConfig(env = {}) {
  return FIREBASE_KEYS.every((key) => String(env[key] || '').trim());
}

function buildReleaseEnvironment({ processEnv = {}, localEnv = {}, productionEnv = {} } = {}) {
  return {
    ...processEnv,
    ...PRODUCTION_DEFAULTS,
    ...(String(localEnv.MAPBOX_ACCESS_TOKEN || '').trim()
      ? { MAPBOX_ACCESS_TOKEN: String(localEnv.MAPBOX_ACCESS_TOKEN).trim() }
      : {}),
    ...productionEnv,
  };
}

function validateReleaseRuntime(env = {}, { googleServicesExists = false } = {}) {
  if (String(env.MANECOMB_APP_ENV || '').trim() !== 'production') {
    throw new Error('[apk] MANECOMB_APP_ENV=production es obligatorio para Release.');
  }

  for (const key of ['MANECOMB_API_URL', 'MANECOMB_SOCKET_URL']) {
    if (!String(env[key] || '').trim().startsWith('https://')) {
      throw new Error(`[apk] ${key} debe usar HTTPS en Release.`);
    }
  }

  if (String(env.MANECOMB_ANDROID_CLEARTEXT || '').trim() !== '0') {
    throw new Error('[apk] MANECOMB_ANDROID_CLEARTEXT=0 es obligatorio para Release.');
  }

  if (!String(env.MAPBOX_ACCESS_TOKEN || '').trim().startsWith('pk.')) {
    throw new Error(
      '[apk] MAPBOX_ACCESS_TOKEN publico es obligatorio para Release; sin el, MapView cierra la aplicacion.'
    );
  }

  if (String(env.MANECOMB_REQUIRE_FCM || '').trim() !== '1') {
    throw new Error('[apk] MANECOMB_REQUIRE_FCM=1 es obligatorio para certificar un Release de ManeComb.');
  }

  const firebaseConfigured = Boolean(googleServicesExists || hasManualFirebaseConfig(env));
  if (!firebaseConfigured) {
    throw new Error(
      '[apk] FCM es obligatorio para Release. Agrega android/app/google-services.json o inyecta MANECOMB_FIREBASE_*.'
    );
  }

  return { firebaseConfigured: true };
}

module.exports = {
  FIREBASE_KEYS,
  PRODUCTION_DEFAULTS,
  buildReleaseEnvironment,
  hasManualFirebaseConfig,
  validateReleaseRuntime,
};
