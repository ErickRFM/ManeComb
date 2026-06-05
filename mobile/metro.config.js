const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const workspaceRoot = process.env.COMBIS_APK_REAL_WORKSPACE_ROOT
  ? path.resolve(process.env.COMBIS_APK_REAL_WORKSPACE_ROOT)
  : path.resolve(projectRoot, '..');
const ventasRoot = path.resolve(workspaceRoot, 'ventas');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toPathPattern = (value) => new RegExp(`${escapeRegExp(value)}[/\\\\].*`);

const config = {
  projectRoot,
  watchFolders: [ventasRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    extraNodeModules: {
      '@': projectRoot,
      ventas: ventasRoot,
    },
    blockList: [toPathPattern(path.resolve(ventasRoot, 'node_modules'))],
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
