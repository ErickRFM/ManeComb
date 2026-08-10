const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { withAndroidSdkEnv } = require('./android-sdk');
const { patchAndroidNodePath } = require('./patch-android-node-path');

const projectRoot = path.resolve(__dirname, '..');
const androidDir = path.join(projectRoot, 'android');

function readEnvFile(fileName) {
  const envPath = path.join(projectRoot, fileName);

  if (!fs.existsSync(envPath)) {
    return {};
  }

  return Object.fromEntries(
    fs
      .readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        return [key, value];
      })
  );
}

const productionDefaults = {
  MANECOMB_APP_ENV: 'production',
  MANECOMB_API_URL: 'https://manecomb.onrender.com/api',
  MANECOMB_SOCKET_URL: 'https://manecomb.onrender.com',
  MANECOMB_API_TIMEOUT_MS: '15000',
  MANECOMB_ANDROID_CLEARTEXT: '0',
};

function findAvailableSubstDrive() {
  const preferredDrives = ['M', 'R', 'T', 'U', 'V', 'W'];
  return preferredDrives.find((letter) => !fs.existsSync(`${letter}:\\`));
}

function runFromShortWindowsPathIfNeeded() {
  const shouldUseSubst =
    process.env.COMBIS_APK_USE_SUBST === '1' ||
    (process.env.COMBIS_APK_USE_SUBST !== '0' && projectRoot.length > 40);

  if (
    process.platform !== 'win32' ||
    process.env.COMBIS_APK_SUBST_DRIVE ||
    !shouldUseSubst
  ) {
    return;
  }

  const driveLetter = findAvailableSubstDrive();

  if (!driveLetter) {
    console.warn('[debug-apk] No hay letra libre para ruta corta; continuando en la ruta actual.');
    return;
  }

  const drive = `${driveLetter}:`;
  const realWorkspaceRoot = path.dirname(projectRoot);
  const substRoot = path.dirname(realWorkspaceRoot);
  const substWorkspaceRoot = `${drive}\\${path.basename(realWorkspaceRoot)}`;
  const substProjectRoot = `${substWorkspaceRoot}\\${path.basename(projectRoot)}`;
  const scriptPath = `${substProjectRoot}\\scripts\\build-android-debug-bundled.js`;
  const preserveSubstRealpath = `${substProjectRoot}\\scripts\\preserve-subst-realpath.cjs`;
  const nodeOptions = [process.env.NODE_OPTIONS, `--require=${preserveSubstRealpath}`]
    .filter(Boolean)
    .join(' ');

  console.log(`[debug-apk] Ruta larga detectada (${projectRoot.length} caracteres).`);
  console.log(`[debug-apk] Usando unidad temporal ${drive} para evitar limites de CMake/Ninja.`);

  const mount = spawnSync('subst', [drive, substRoot], {
    stdio: 'inherit',
    shell: true,
  });

  if (mount.status !== 0) {
    console.warn('[debug-apk] No se pudo crear unidad temporal; continuando en la ruta actual.');
    return;
  }

  const child = spawnSync(process.execPath, [scriptPath, ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: false,
    cwd: substProjectRoot,
    env: {
      ...process.env,
      COMBIS_APK_SUBST_DRIVE: drive,
      COMBIS_APK_SUBST_PROJECT_ROOT: substProjectRoot,
      COMBIS_APK_REAL_WORKSPACE_ROOT: substWorkspaceRoot,
      NODE_OPTIONS: nodeOptions,
    },
  });

  spawnSync('subst', [drive, '/D'], {
    stdio: 'inherit',
    shell: true,
  });

  process.exit(child.status || 0);
}

function removeInsideProjectDir(targetPath) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedTarget = path.resolve(targetPath);

  if (
    resolvedTarget !== resolvedProjectRoot &&
    !resolvedTarget.startsWith(`${resolvedProjectRoot}${path.sep}`)
  ) {
    throw new Error(`[debug-apk] Ruta fuera del proyecto: ${resolvedTarget}`);
  }

  if (!fs.existsSync(resolvedTarget)) {
    return;
  }

  fs.rmSync(resolvedTarget, { recursive: true, force: true });
  console.log(`[debug-apk] Cache nativa removida: ${resolvedTarget}`);
}

function nativeCacheReferencesStaleGradleHome(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return false;
  }

  const stack = [targetPath];
  const searchableExtensions = new Set(['', '.cmake', '.json', '.ninja', '.txt']);

  while (stack.length) {
    const currentPath = stack.pop();
    const stat = fs.statSync(currentPath);

    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(currentPath)) {
        stack.push(path.join(currentPath, entry));
      }
      continue;
    }

    if (!searchableExtensions.has(path.extname(currentPath).toLowerCase())) {
      continue;
    }

    try {
      const source = fs.readFileSync(currentPath, 'utf8').replace(/\\/g, '/');
      if (source.includes('.gradle-local/caches')) {
        return true;
      }
    } catch {
      // Ignore non-text generated files.
    }
  }

  return false;
}

function removeStaleNativeCache(targetPath) {
  if (nativeCacheReferencesStaleGradleHome(targetPath)) {
    removeInsideProjectDir(targetPath);
  }
}

runFromShortWindowsPathIfNeeded();

function run(command, args, options = {}) {
  console.log(`[debug-apk] Ejecutando: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32' && !command.toLowerCase().endsWith('.exe'),
    ...options,
  });

  if (result.status !== 0) {
    console.error(`[debug-apk] Error: comando fallo con codigo ${result.status}`);
    process.exit(result.status || 1);
  }
}

const envFileName = process.env.ENVFILE || '.env.production';
const fileEnv = {
  ...productionDefaults,
  ...readEnvFile(envFileName),
};
const { sdkRoot, javaHome, gradleUserHome, env } = withAndroidSdkEnv({
  ...process.env,
  ...fileEnv,
  CI: '1',
  NODE_ENV: 'production',
  ENVFILE: envFileName,
  ...(process.platform === 'win32'
    ? { GRADLE_USER_HOME: 'C:\\gradle-cache-combis' }
    : {}),
});

const reactNativeCli = path.join(projectRoot, 'node_modules', 'react-native', 'cli.js');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

console.log('[debug-apk] Modo: debug bundled React Native CLI');
console.log(`[debug-apk] Envfile: ${envFileName}`);
console.log(`[debug-apk] API: ${env.MANECOMB_API_URL}`);
console.log(`[debug-apk] Socket: ${env.MANECOMB_SOCKET_URL}`);
console.log(`[debug-apk] Android SDK: ${sdkRoot}`);
console.log(`[debug-apk] JAVA_HOME: ${javaHome}`);
console.log(`[debug-apk] GRADLE_USER_HOME: ${gradleUserHome}`);

if (!fs.existsSync(androidDir)) {
  console.error('[debug-apk] No se encontro android/. En React Native CLI el proyecto nativo debe estar versionado.');
  process.exit(2);
}

console.log('[debug-apk] Parcheando rutas de Node...');
patchAndroidNodePath(androidDir, env.NODE_BINARY);

removeStaleNativeCache(path.join(androidDir, 'app', '.cxx'));
removeStaleNativeCache(path.join(projectRoot, 'node_modules', 'react-native-screens', 'android', '.cxx'));

run(process.execPath, [
  reactNativeCli,
  'bundle',
  '--platform',
  'android',
  '--dev',
  'false',
  '--entry-file',
  'index.js',
  '--bundle-output',
  'android/app/src/main/assets/index.android.bundle',
  '--assets-dest',
  'android/app/src/main/res',
], {
  env,
});

run(gradlew, ['assembleDebug', '--no-daemon', ...process.argv.slice(2)], {
  cwd: androidDir,
  env,
});

console.log('\n[debug-apk] OK APK debug generado en: android/app/build/outputs/apk/debug/app-debug.apk');
