const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { withAndroidSdkEnv } = require('./android-sdk');
const { patchAndroidNodePath } = require('./patch-android-node-path');

const projectRoot = path.resolve(__dirname, '..');
const androidDir = path.join(projectRoot, 'android');
const releaseApkPath = path.join(
  androidDir,
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release.apk'
);
const releaseAabPath = path.join(
  androidDir,
  'app',
  'build',
  'outputs',
  'bundle',
  'release',
  'app-release.aab'
);
const distDir = path.join(projectRoot, 'dist');
const outputApkPath = path.join(distDir, 'app-release.apk');
const outputAabPath = path.join(distDir, 'app-release.aab');
const legacyOutputApkPath = path.join(distDir, 'combis-control-standalone-release.apk');
const gradlePassthroughArgs = process.argv.slice(2);

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
    console.warn('[apk] No hay letra libre para ruta corta; continuando en la ruta actual.');
    return;
  }

  const drive = `${driveLetter}:`;
  const realWorkspaceRoot = path.dirname(projectRoot);
  const substRoot = path.dirname(realWorkspaceRoot);
  const substWorkspaceRoot = `${drive}\\${path.basename(realWorkspaceRoot)}`;
  const substProjectRoot = `${substWorkspaceRoot}\\${path.basename(projectRoot)}`;
  const scriptPath = `${substProjectRoot}\\scripts\\build-android-apk.js`;
  const preserveSubstRealpath = `${substProjectRoot}\\scripts\\preserve-subst-realpath.cjs`;
  const nodeOptions = [
    process.env.NODE_OPTIONS,
    `--require=${preserveSubstRealpath}`,
  ]
    .filter(Boolean)
    .join(' ');

  console.log(`[apk] Ruta larga detectada (${projectRoot.length} caracteres).`);
  console.log(`[apk] Usando unidad temporal ${drive} para evitar limites de CMake/Ninja.`);

  const mount = spawnSync('subst', [drive, substRoot], {
    stdio: 'inherit',
    shell: true,
  });

  if (mount.status !== 0) {
    console.warn('[apk] No se pudo crear unidad temporal; continuando en la ruta actual.');
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

function removeInsideAndroidDir(targetPath) {
  const resolvedAndroidDir = path.resolve(androidDir);
  const resolvedTarget = path.resolve(targetPath);

  if (
    resolvedTarget !== resolvedAndroidDir &&
    !resolvedTarget.startsWith(`${resolvedAndroidDir}${path.sep}`)
  ) {
    throw new Error(`[apk] Ruta fuera de android/: ${resolvedTarget}`);
  }

  if (!fs.existsSync(resolvedTarget)) {
    return;
  }

  fs.rmSync(resolvedTarget, { recursive: true, force: true });
  console.log(`[apk] Cache nativa removida: ${resolvedTarget}`);
}

runFromShortWindowsPathIfNeeded();

function run(command, args, options = {}) {
  console.log(`[apk] Ejecutando: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.status !== 0) {
    console.error(`[apk] Error: comando fallo con codigo ${result.status}`);
    process.exit(result.status || 1);
  }
}

// 1. Setup Environment with OneDrive Isolation
const fileEnv = {
  ...productionDefaults,
  ...readEnvFile('.env.production'),
};
const { sdkRoot, javaHome, gradleUserHome, env } = withAndroidSdkEnv({
  ...process.env,
  ...fileEnv,
  CI: '1',
  NODE_ENV: 'production',
  ENVFILE: '.env.production',
  // Move Gradle cache OUT of OneDrive to avoid locking issues
  GRADLE_USER_HOME: 'C:\\gradle-cache-combis',
});

console.log('[apk] Modo: release React Native CLI (APK + AAB)');
console.log('[apk] Envfile: .env.production');
console.log(`[apk] API: ${env.MANECOMB_API_URL}`);
console.log(`[apk] Socket: ${env.MANECOMB_SOCKET_URL}`);
console.log(`[apk] Android SDK: ${sdkRoot}`);
console.log(`[apk] JAVA_HOME: ${javaHome}`);
console.log(`[apk] GRADLE_USER_HOME: ${gradleUserHome}`);

if (!fs.existsSync(androidDir)) {
  console.error('[apk] No se encontro android/. En React Native CLI el proyecto nativo debe estar versionado.');
  process.exit(2);
}

// 3. Patch Node path (Fixes common Windows issue)
console.log('[apk] Parcheando rutas de Node...');
patchAndroidNodePath(androidDir, env.NODE_BINARY);

// 3.5 Remove stale CMake state before Gradle clean. The generated autolinking
// metadata must remain available while Gradle configures the clean task.
removeInsideAndroidDir(path.join(androidDir, 'app', '.cxx'));

// 4. Assemble release artifacts. Avoid Gradle's global clean because third-party
// native modules under node_modules can be locked by Windows; app CMake state was
// already cleared above.
console.log('[apk] Compilando release...');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

run(gradlew, ['assembleRelease', '--no-daemon', ...gradlePassthroughArgs], {
  cwd: androidDir,
  env,
});

run(gradlew, ['bundleRelease', '--no-daemon', ...gradlePassthroughArgs], {
  cwd: androidDir,
  env,
});

// 5. Success check
if (!fs.existsSync(releaseApkPath)) {
  console.error(`[apk] No se encontro el APK release en: ${releaseApkPath}`);
  console.error('[apk] Sugerencia: Si hay errores de Ninja/CMake, mueve el proyecto a C:\\combis-app');
  process.exit(2);
}

if (!fs.existsSync(releaseAabPath)) {
  console.error(`[apk] No se encontro el AAB release en: ${releaseAabPath}`);
  process.exit(2);
}

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(releaseApkPath, outputApkPath);
fs.copyFileSync(releaseAabPath, outputAabPath);
fs.copyFileSync(releaseApkPath, legacyOutputApkPath);
console.log(`\n[apk] OK APK release generado en: ${outputApkPath}`);
console.log(`[apk] OK AAB release generado en: ${outputAabPath}`);
