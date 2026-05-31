const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { withAndroidSdkEnv } = require('./android-sdk');
const { patchAndroidNodePath } = require('./patch-android-node-path');

const projectRoot = path.resolve(__dirname, '..');
const androidDir = path.join(projectRoot, 'android');
const debugApkPath = path.join(
  androidDir,
  'app',
  'build',
  'outputs',
  'apk',
  'debug',
  'app-debug.apk'
);
const distDir = path.join(projectRoot, 'dist');
const outputApkPath = path.join(distDir, 'combis-control-development.apk');

function run(command, args, options = {}) {
  console.log(`[dev-apk] Ejecutando: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.status !== 0) {
    console.error(`[dev-apk] Error: comando fallo con codigo ${result.status}`);
    process.exit(result.status || 1);
  }
}

const { sdkRoot, javaHome, gradleUserHome, env } = withAndroidSdkEnv({
  ...process.env,
  CI: '1',
  NODE_ENV: 'development',
  GRADLE_USER_HOME: 'C:\\gradle-cache-combis',
});

console.log(`[dev-apk] Android SDK: ${sdkRoot}`);
console.log(`[dev-apk] JAVA_HOME: ${javaHome}`);
console.log(`[dev-apk] GRADLE_USER_HOME: ${gradleUserHome}`);

if (!fs.existsSync(androidDir)) {
  console.log('[dev-apk] Generando directorio native (prebuild)...');
  run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], {
    env,
  });
}

console.log('[dev-apk] Parcheando rutas de Node...');
patchAndroidNodePath(androidDir, env.NODE_BINARY);

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

run(gradlew, ['assembleDebug', '--no-daemon'], {
  cwd: androidDir,
  env,
});

if (!fs.existsSync(debugApkPath)) {
  console.error(`[dev-apk] No se encontro el APK debug en: ${debugApkPath}`);
  process.exit(2);
}

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

fs.copyFileSync(debugApkPath, outputApkPath);
console.log(`\n[dev-apk] APK development client generado en: ${outputApkPath}`);
