const baseConfig = require('./app.json');

function isProductionProfile() {
  return (
    process.env.EAS_BUILD_PROFILE === 'production' ||
    process.env.APP_ENV === 'production' ||
    process.env.NODE_ENV === 'production'
  );
}

function shouldAllowCleartext() {
  if (process.env.EXPO_ANDROID_CLEARTEXT === '1') {
    return true;
  }

  if (process.env.EXPO_ANDROID_CLEARTEXT === '0') {
    return false;
  }

  return !isProductionProfile();
}

module.exports = ({ config }) => {
  const expo = {
    ...config,
    ...baseConfig.expo,
    android: {
      ...baseConfig.expo.android,
    },
    plugins: [
      ...(baseConfig.expo.plugins || []),
      [
        './plugins/with-android-cleartext',
        {
          cleartext: shouldAllowCleartext(),
        },
      ],
    ],
    extra: {
      ...(baseConfig.expo.extra || {}),
      apiUrl: process.env.EXPO_PUBLIC_API_URL || null,
      socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL || null,
      lanHost: process.env.EXPO_PUBLIC_LAN_HOST || null,
      apiTimeoutMs: process.env.EXPO_PUBLIC_API_TIMEOUT_MS || null,
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || null,
      cleartextEnabled: shouldAllowCleartext(),
      eas: {
        ...(baseConfig.expo.extra?.eas || {}),
        projectId: process.env.EAS_PROJECT_ID || baseConfig.expo.extra?.eas?.projectId,
      },
    },
  };

  return expo;
};
