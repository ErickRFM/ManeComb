const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, '.env');
const hostMode = process.argv[2] === 'lan' ? 'lan' : 'tunnel';

const excludedInterfacePatterns = [
  /virtual/i,
  /vmware/i,
  /vbox/i,
  /hyper-v/i,
  /vethernet/i,
  /loopback/i,
  /bluetooth/i,
  /tailscale/i,
];

const preferredInterfacePatterns = [/wi-?fi/i, /wlan/i, /wireless/i];

function isPrivateIpv4(address) {
  return (
    /^10\./.test(address) ||
    /^192\.168\./.test(address) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
  );
}

function scoreInterface(name) {
  let score = 0;

  if (preferredInterfacePatterns.some((pattern) => pattern.test(name))) {
    score += 10;
  }

  if (!excludedInterfacePatterns.some((pattern) => pattern.test(name))) {
    score += 3;
  }

  return score;
}

function detectLocalIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  Object.entries(interfaces).forEach(([name, addresses]) => {
    (addresses || []).forEach((details) => {
      if (!details || details.family !== 'IPv4' || details.internal) {
        return;
      }

      if (!isPrivateIpv4(details.address)) {
        return;
      }

      if (excludedInterfacePatterns.some((pattern) => pattern.test(name))) {
        return;
      }

      candidates.push({
        name,
        address: details.address,
        score: scoreInterface(name),
      });
    });
  });

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.address || null;
}

function updateEnvFile(localIp) {
  const apiUrl = `http://${localIp}:5000/api`;
  const socketUrl = `http://${localIp}:5000`;
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = existing ? existing.split(/\r?\n/) : [];
  const nextEntries = new Map();

  lines.forEach((line) => {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) {
      return;
    }

    const separatorIndex = line.indexOf('=');
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    nextEntries.set(key, value);
  });

  nextEntries.set('EXPO_PUBLIC_API_URL', apiUrl);
  nextEntries.set('EXPO_PUBLIC_SOCKET_URL', socketUrl);
  nextEntries.set('EXPO_PUBLIC_LAN_HOST', localIp);
  if (!nextEntries.has('EXPO_PUBLIC_API_TIMEOUT_MS')) {
    nextEntries.set('EXPO_PUBLIC_API_TIMEOUT_MS', '15000');
  }
  if (!nextEntries.has('EXPO_ANDROID_CLEARTEXT')) {
    nextEntries.set('EXPO_ANDROID_CLEARTEXT', '1');
  }

  const output = `${Array.from(nextEntries.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`;

  try {
    fs.writeFileSync(envPath, output, 'utf8');
  } catch (error) {
    console.error(`[mobile:start-phone] Error al escribir .env: ${error.message}`);
    console.warn('Sugerencia: Cierra el archivo .env si lo tienes abierto o mueve el proyecto fuera de OneDrive.');
  }

  return { apiUrl, socketUrl };
}

function startExpo() {
  const localIp = detectLocalIp();

  if (!localIp) {
    console.error(
      '[mobile:start-phone] No se encontro una IP local privada. Conecta la laptop a la misma Wi-Fi que el telefono e intenta de nuevo.'
    );
    process.exit(1);
  }

  const { apiUrl } = updateEnvFile(localIp);
  console.log(`[mobile:start-phone] API movil configurada en ${apiUrl}`);
  console.log(`[mobile:start-phone] Expo Go iniciara en modo ${hostMode}.`);

  const expoCli = require.resolve('expo/bin/cli');
  const args = ['start', '--go', hostMode === 'lan' ? '--lan' : '--tunnel', '-c'];
  const child = spawn(process.execPath, [expoCli, ...args], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

startExpo();
