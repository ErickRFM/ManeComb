const path = require('path');
const { spawnSync } = require('child_process');
const { withAndroidSdkEnv } = require('./android-sdk');

const projectRoot = path.resolve(__dirname, '..');
const mode = process.argv[2] || 'test';
const extraArgs = process.argv.slice(3);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.status !== 0) {
    const error = new Error(`Command failed: ${command} ${args.join(' ')}`);
    error.status = result.status || 1;
    throw error;
  }
}

const { sdkRoot, javaHome, gradleUserHome, env } = withAndroidSdkEnv({
  ...process.env,
  CI: '1',
  NODE_ENV: 'test',
  GRADLE_USER_HOME: 'C:\\gradle-cache-combis',
});
console.log(`[detox] Android SDK activo: ${sdkRoot}`);
console.log(`[detox] JAVA_HOME activo: ${javaHome}`);
console.log(`[detox] GRADLE_USER_HOME activo: ${gradleUserHome}`);

async function main() {
  if (mode === 'build') {
    run('npx', ['detox', 'build', '-c', 'android.emu.debug', ...extraArgs], { env });
    return;
  }

  if (mode === 'test') {
    console.log('[detox] Ejecutando APK Detox con bundle JS embebido; no se requiere Metro ni dev-client.');
    run('npx', ['detox', 'test', '-c', 'android.emu.debug', ...extraArgs], {
      env,
    });

    return;
  }

  const error = new Error(`Modo Detox no soportado: ${mode}`);
  error.status = 2;
  throw error;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(error.status || 1);
});
