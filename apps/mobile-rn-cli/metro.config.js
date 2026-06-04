const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const watchFolders = [
  process.env.MANECOMB_RNCLI_REAL_PROJECT_ROOT,
].filter((folder) => folder && folder !== __dirname);

const config = {
  watchFolders,
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
