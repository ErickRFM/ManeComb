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
    // Alias por prefijo, con la misma semantica que tsconfig ("@shared/*"),
    // Vite (find: '@shared') y Jest ("^@shared/(.*)$").
    //
    // No se usa extraNodeModules: Metro indexa esa tabla por *nombre de paquete*
    // (parseBareSpecifier), y en un especificador con '@' inicial el nombre de
    // paquete es el scope completo -- '@shared/operational-contract', no
    // '@shared'. Una clave '@shared' por lo tanto nunca coincide y el alias
    // queda inerte. resolveRequest si permite prefijos, y escala a futuros
    // '@shared/*' sin tocar esta configuracion.
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === '@shared' || moduleName.startsWith('@shared/')) {
        const subpath = moduleName.slice('@shared'.length);
        return context.resolveRequest(
          context,
          path.join(sharedRoot, subpath),
          platform
        );
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
