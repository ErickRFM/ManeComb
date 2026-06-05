const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function resolveAdb() {
  if (process.env.ADB && fs.existsSync(process.env.ADB)) {
    return process.env.ADB;
  }

  const localSdkAdb = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe')
    : '';

  if (localSdkAdb && fs.existsSync(localSdkAdb)) {
    return localSdkAdb;
  }

  return process.platform === 'win32' ? 'adb.exe' : 'adb';
}

function run(adb, args, options = {}) {
  return spawnSync(adb, args, {
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    shell: false,
  });
}

function parseAdbDeviceLine(line) {
  const trimmedLine = line.trim();

  if (!trimmedLine || trimmedLine.startsWith('List of devices')) {
    return null;
  }

  const [id, state, ...detailsParts] = trimmedLine.split(/\s+/);

  if (!id || !state) {
    return null;
  }

  const details = detailsParts.join(' ');
  const modelMatch = details.match(/\bmodel:([^\s]+)/);
  const productMatch = details.match(/\bproduct:([^\s]+)/);

  return {
    details,
    id,
    isEmulator: id.startsWith('emulator-'),
    model: modelMatch?.[1] || '',
    product: productMatch?.[1] || '',
    state,
  };
}

function listAdbDevices(adb) {
  const result = run(adb, ['devices', '-l'], { capture: true });

  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map(parseAdbDeviceLine)
    .filter(Boolean);
}

function listDeviceIds(adb) {
  return listAdbDevices(adb)
    .filter((device) => device.state === 'device')
    .map((device) => device.id);
}

function pickDevice(deviceIds) {
  if (process.env.ANDROID_SERIAL && deviceIds.includes(process.env.ANDROID_SERIAL)) {
    return process.env.ANDROID_SERIAL;
  }

  const emulator = deviceIds.find((deviceId) => deviceId.startsWith('emulator-'));
  if (emulator) {
    return emulator;
  }

  return deviceIds.length === 1 ? deviceIds[0] : null;
}

function getSelectedDevice(adb = resolveAdb()) {
  const deviceIds = listDeviceIds(adb);
  const deviceId = pickDevice(deviceIds);

  if (!deviceId) {
    throw new Error(
      deviceIds.length > 1
        ? `Hay multiples dispositivos: ${deviceIds.join(', ')}. Define ANDROID_SERIAL.`
        : 'No hay dispositivos ADB en estado device.'
    );
  }

  return deviceId;
}

function pickPhysicalDevice(devices) {
  const readyPhysicalDevices = devices.filter(
    (device) => device.state === 'device' && !device.isEmulator
  );

  if (
    process.env.ANDROID_SERIAL &&
    readyPhysicalDevices.some((device) => device.id === process.env.ANDROID_SERIAL)
  ) {
    return process.env.ANDROID_SERIAL;
  }

  return readyPhysicalDevices.length === 1 ? readyPhysicalDevices[0].id : null;
}

function getSelectedPhysicalDevice(adb = resolveAdb()) {
  const devices = listAdbDevices(adb);
  const deviceId = pickPhysicalDevice(devices);

  if (!deviceId) {
    const physicalDevices = devices.filter((device) => !device.isEmulator);
    const unauthorized = physicalDevices.filter((device) => device.state === 'unauthorized');
    const offline = physicalDevices.filter((device) => device.state === 'offline');

    if (unauthorized.length > 0) {
      throw new Error(
        `El celular esta unauthorized: ${unauthorized.map((device) => device.id).join(', ')}. Acepta la huella RSA en Android.`
      );
    }

    if (offline.length > 0) {
      throw new Error(
        `El celular esta offline: ${offline.map((device) => device.id).join(', ')}. Reinicia adb o reconecta USB.`
      );
    }

    throw new Error(
      physicalDevices.length > 1
        ? `Hay multiples celulares: ${physicalDevices.map((device) => device.id).join(', ')}. Define ANDROID_SERIAL.`
        : 'No hay celular fisico ADB en estado device.'
    );
  }

  return deviceId;
}

function reversePort(adb, deviceId, hostPort, devicePort = hostPort) {
  const reverseResult = run(adb, [
    '-s',
    deviceId,
    'reverse',
    `tcp:${devicePort}`,
    `tcp:${hostPort}`,
  ]);

  if (reverseResult.status !== 0) {
    process.exit(reverseResult.status || 1);
  }

  console.log(`[adb-reverse] tcp:${devicePort} -> tcp:${hostPort} aplicado en ${deviceId}`);
}

function reverseMetro(adb, deviceId) {
  reversePort(adb, deviceId, 8081);
}

module.exports = {
  getSelectedPhysicalDevice,
  getSelectedDevice,
  listAdbDevices,
  listDeviceIds,
  pickDevice,
  pickPhysicalDevice,
  resolveAdb,
  reverseMetro,
  reversePort,
  run,
};

if (require.main === module) {
  const adb = resolveAdb();

  try {
    reverseMetro(adb, getSelectedDevice(adb));
  } catch (error) {
    console.error(`[adb-reverse] ${error.message}`);
    process.exit(1);
  }
}
