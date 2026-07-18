const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const workspaceRoot = process.env.COMBIS_APK_REAL_WORKSPACE_ROOT
  ? path.resolve(process.env.COMBIS_APK_REAL_WORKSPACE_ROOT)
  : path.resolve(projectRoot, '..');

// Contrato operacional compartido con backend y Portal.
const sharedRoot = path.resolve(workspaceRoot, 'shared');

const config = {
  projectRoot,
  // Metro solo resuelve fuera de projectRoot lo que vigila explicitamente.
  watchFolders: [sharedRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    extraNodeModules: {
      '@': projectRoot,
      '@shared': sharedRoot,
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
