const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = process.env.COMBIS_APK_REAL_WORKSPACE_ROOT
  ? path.resolve(process.env.COMBIS_APK_REAL_WORKSPACE_ROOT)
  : path.resolve(projectRoot, '..');
const ventasRoot = path.resolve(workspaceRoot, 'ventas');

const config = getDefaultConfig(projectRoot);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toPathPattern = (value) => new RegExp(`${escapeRegExp(value)}[/\\\\].*`);

config.resolver.useWatchman = false;
config.watchFolders = Array.from(new Set([...(config.watchFolders || []), ventasRoot]));
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  ventas: ventasRoot,
};
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList].filter(Boolean)),
  toPathPattern(path.resolve(ventasRoot, 'node_modules')),
];

module.exports = config;
