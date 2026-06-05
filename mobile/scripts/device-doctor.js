const http = require('http');
const { configureLocalEnv } = require('./set-lan-ip');
const {
  getSelectedPhysicalDevice,
  listAdbDevices,
  resolveAdb,
  reverseMetro,
  reversePort,
  run,
} = require('./adb-reverse');

function hasArg(name) {
  return process.argv.slice(2).includes(name);
}

function requestUrl(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve({
          body,
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
        });
      });
    });

    request.setTimeout(5000, () => {
      request.destroy();
      resolve({ body: '', ok: false, status: 'timeout' });
    });
    request.on('error', (error) => resolve({ body: error.message, ok: false, status: 'error' }));
  });
}

function runDeviceCurl(adb, deviceId, url) {
  const result = run(
    adb,
    ['-s', deviceId, 'shell', 'curl', '-sS', '--connect-timeout', '5', url],
    { capture: true }
  );

  return {
    body: result.stdout || result.stderr || '',
    ok: result.status === 0,
    status: result.status,
  };
}

function printDeviceTable(devices) {
  if (devices.length === 0) {
    console.log('[device:doctor] adb devices: sin dispositivos');
    return;
  }

  console.log('[device:doctor] adb devices:');
  devices.forEach((device) => {
    console.log(
      `- ${device.id} | ${device.state} | ${device.isEmulator ? 'emulador' : 'fisico'} | ${device.model || device.product || 'sin modelo'}`
    );
  });
}

async function main() {
  const usbReverse = hasArg('--usb-reverse');
  const adb = resolveAdb();
  const devices = listAdbDevices(adb);
  printDeviceTable(devices);

  const deviceId = getSelectedPhysicalDevice(adb);
  const env = configureLocalEnv({ usbReverse });
  const lanHealthUrl = `http://${env.host}:5000/api/health`;
  const deviceHealthUrl = usbReverse ? 'http://127.0.0.1:5000/api/health' : lanHealthUrl;

  reverseMetro(adb, deviceId);

  if (usbReverse) {
    reversePort(adb, deviceId, 5000);
  }

  const pcHealth = await requestUrl(lanHealthUrl);
  console.log(
    `[device:doctor] PC -> backend LAN ${lanHealthUrl}: ${pcHealth.ok ? 'OK' : `FAIL (${pcHealth.status})`}`
  );

  const phoneHealth = runDeviceCurl(adb, deviceId, deviceHealthUrl);
  console.log(
    `[device:doctor] OnePlus -> backend ${deviceHealthUrl}: ${phoneHealth.ok ? 'OK' : `FAIL (${phoneHealth.status})`}`
  );

  const reverseList = run(adb, ['-s', deviceId, 'reverse', '--list'], { capture: true });
  console.log('[device:doctor] adb reverse --list:');
  console.log((reverseList.stdout || '').trim() || '(sin reverse activo)');

  if (!pcHealth.ok || !phoneHealth.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`[device:doctor] ${error.message}`);
  process.exit(1);
});
