const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const workspaceRoot = process.env.COMBIS_APK_REAL_WORKSPACE_ROOT
  ? path.resolve(process.env.COMBIS_APK_REAL_WORKSPACE_ROOT)
  : path.resolve(projectRoot, '..');

const config = {
  projectRoot,
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    extraNodeModules: {
      '@': projectRoot,
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
