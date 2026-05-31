const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAndroidCleartext(config, props = {}) {
  return withAndroidManifest(config, (modConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);
    application.$['android:usesCleartextTraffic'] = props.cleartext ? 'true' : 'false';
    return modConfig;
  });
};
