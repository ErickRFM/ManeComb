const path = require('path');
const { spawnSync } = require('child_process');
const { getSelectedDevice, resolveAdb, reverseMetro } = require('./adb-reverse');

const adb = resolveAdb();
const deviceId = getSelectedDevice(adb);
const androidDir = path.resolve(__dirname, '..', 'android');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const androidSdkRoot = path.resolve(path.dirname(adb), '..');
const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
const nextPath = `${path.dirname(adb)}${path.delimiter}${process.env[pathKey] || process.env.PATH || ''}`;

reverseMetro(adb, deviceId);

const result = spawnSync(gradlew, ['installDebug'], {
  cwd: androidDir,
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

if (result.status !== 0) {
  process.exit(result.status || 1);
}

reverseMetro(adb, deviceId);
