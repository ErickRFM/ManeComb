const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { withAndroidSdkEnv } = require('./android-sdk');
const { patchAndroidNodePath } = require('./patch-android-node-path');

const projectRoot = path.resolve(__dirname, '..');
const androidDir = path.join(projectRoot, 'android');
const extraArgs = process.argv.slice(2);

function removeInsideAndroidDir(targetPath) {
  const resolvedAndroidDir = path.resolve(androidDir);
  const resolvedTarget = path.resolve(targetPath);

  if (
    resolvedTarget !== resolvedAndroidDir &&
    !resolvedTarget.startsWith(`${resolvedAndroidDir}${path.sep}`)
  ) {
    throw new Error(`[detox] Ruta fuera de android/: ${resolvedTarget}`);
  }

  if (!fs.existsSync(resolvedTarget)) {
    return;
  }

  fs.rmSync(resolvedTarget, { recursive: true, force: true });
  console.log(`[detox] Cache nativa removida: ${resolvedTarget}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (!fs.existsSync(androidDir)) {
  console.error('[detox] No se encontro android/. En React Native CLI el proyecto nativo debe estar versionado.');
  process.exit(2);
}

const { sdkRoot, javaHome, gradleUserHome, env } = withAndroidSdkEnv({
  ...process.env,
  CI: '1',
  NODE_ENV: 'production',
  GRADLE_USER_HOME: 'C:\\gradle-cache-combis',
});
patchAndroidNodePath(androidDir, env.NODE_BINARY);
removeInsideAndroidDir(path.join(androidDir, 'build', 'generated', 'autolinking'));
removeInsideAndroidDir(path.join(androidDir, 'app', '.cxx'));

console.log(`[detox] Android SDK listo en: ${sdkRoot}`);
console.log(`[detox] JAVA_HOME listo en: ${javaHome}`);
console.log(`[detox] GRADLE_USER_HOME listo en: ${gradleUserHome}`);

run(
  process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
  [
    ':app:assembleDebug',
    ':app:assembleAndroidTest',
    '-DtestBuildType=debug',
    '-Pcombis.detoxBundle=true',
    '--no-daemon',
    ...extraArgs,
  ],
  {
    cwd: androidDir,
    env,
  }
);
