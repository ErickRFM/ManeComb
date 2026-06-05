const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');
const { getSelectedDevice, resolveAdb, reverseMetro } = require('./adb-reverse');

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
  const adb = resolveAdb();
  const deviceId = getSelectedDevice(adb);
  const androidSdkRoot = path.resolve(path.dirname(adb), '..');
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
  const nextPath = `${path.dirname(adb)}${path.delimiter}${process.env[pathKey] || process.env.PATH || ''}`;
  reverseMetro(adb, deviceId);

  const args = ['react-native', 'run-android', '--device', deviceId];

  if (await isMetroRunning()) {
    args.splice(2, 0, '--no-packager');
  }

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(npx, args, {
    env: {
      ...process.env,
      ANDROID_SERIAL: deviceId,
      ANDROID_HOME: process.env.ANDROID_HOME || androidSdkRoot,
      ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT || androidSdkRoot,
      [pathKey]: nextPath,
    },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error(`[android-run] ${error.message}`);
  process.exit(1);
});
