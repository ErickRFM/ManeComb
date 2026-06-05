const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');
const { withAndroidSdkEnv } = require('./android-sdk');
const { configureLocalEnv } = require('./set-lan-ip');
const {
  getSelectedPhysicalDevice,
  resolveAdb,
  reverseMetro,
  reversePort,
  run,
} = require('./adb-reverse');

const androidDir = path.resolve(__dirname, '..', 'android');
const applicationId = 'com.anonymous.combiscontrol';

function hasArg(name) {
  return process.argv.slice(2).includes(name);
}

function isMetroRunning() {
  return new Promise((resolve) => {
    const request = http.get('http://localhost:8081/status', (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve(body.includes('packager-status:running'));
      });
    });

    request.setTimeout(3000, () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

async function main() {
  const usbReverse = hasArg('--usb-reverse');
  const adb = resolveAdb();
  const deviceId = getSelectedPhysicalDevice(adb);
  const localEnv = configureLocalEnv({ usbReverse });
  const sdkEnv = withAndroidSdkEnv({
    ...process.env,
    ...localEnv.values,
    ENVFILE: '.env.local',
  });
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
  const nextPath = `${path.dirname(adb)}${path.delimiter}${sdkEnv.env[pathKey] || sdkEnv.env.PATH || ''}`;

  reverseMetro(adb, deviceId);

  if (usbReverse) {
    reversePort(adb, deviceId, 5000);
  }

  console.log(`[android:device] Dispositivo fisico: ${deviceId}`);
  console.log(`[android:device] API: ${localEnv.apiUrl}`);
  console.log(`[android:device] Socket: ${localEnv.socketUrl}`);

  if (!(await isMetroRunning())) {
    console.warn(
      '[android:device] Metro no respondio en http://localhost:8081/status. Mantener npm start abierto antes de abrir la app.'
    );
  }

  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const result = spawnSync(gradlew, ['installDebug'], {
    cwd: androidDir,
    env: {
      ...sdkEnv.env,
      ANDROID_SERIAL: deviceId,
      [pathKey]: nextPath,
    },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }

  reverseMetro(adb, deviceId);

  if (usbReverse) {
    reversePort(adb, deviceId, 5000);
  }

  run(adb, [
    '-s',
    deviceId,
    'shell',
    'monkey',
    '-p',
    applicationId,
    '-c',
    'android.intent.category.LAUNCHER',
    '1',
  ]);

  process.exit(0);
}

main().catch((error) => {
  console.error(`[android:device] ${error.message}`);
  process.exit(1);
});
