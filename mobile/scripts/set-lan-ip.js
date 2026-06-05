const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const defaultBackendPort = 5000;
const virtualInterfacePattern =
  /vmware|virtualbox|vbox|hyper-v|vethernet|wsl|docker|loopback|bluetooth|tap|tailscale|zerotier/i;

function isValidIpv4(value) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(value || ''))) {
    return false;
  }

  return value.split('.').every((part) => {
    const number = Number(part);
    return Number.isInteger(number) && number >= 0 && number <= 255;
  });
}

function isPrivateIpv4(value) {
  if (!isValidIpv4(value)) {
    return false;
  }

  const [first, second] = value.split('.').map(Number);

  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function isUsableIpv4(value) {
  return (
    isPrivateIpv4(value) &&
    value !== '127.0.0.1' &&
    value !== '0.0.0.0' &&
    !value.startsWith('169.254.')
  );
}

function parseIpconfigAdapters(output) {
  const adapters = [];
  let current = null;

  output.split(/\r?\n/).forEach((line) => {
    if (/^\S.*:\s*$/.test(line)) {
      current = {
        gateway: '',
        name: line.replace(/:\s*$/, '').trim(),
        ipv4: '',
      };
      adapters.push(current);
      return;
    }

    if (!current) {
      return;
    }

    const ipv4Match = line.match(/IPv4.*?:\s*([0-9.]+)/i);
    if (ipv4Match) {
      current.ipv4 = ipv4Match[1];
      return;
    }

    const gatewayMatch = line.match(/(?:Gateway|Puerta.*enlace).*?:\s*([0-9.]+)/i);
    if (gatewayMatch) {
      current.gateway = gatewayMatch[1];
    }
  });

  return adapters;
}

function detectFromIpconfig() {
  if (process.platform !== 'win32') {
    return null;
  }

  const result = spawnSync('ipconfig', [], {
    encoding: 'utf8',
    shell: true,
  });

  if (result.status !== 0) {
    return null;
  }

  const adapters = parseIpconfigAdapters(result.stdout || '');
  const candidates = adapters.filter(
    (adapter) =>
      isUsableIpv4(adapter.ipv4) &&
      isUsableIpv4(adapter.gateway) &&
      !virtualInterfacePattern.test(adapter.name)
  );

  return candidates[0]
    ? {
        address: candidates[0].ipv4,
        interfaceName: candidates[0].name,
        source: 'ipconfig',
      }
    : null;
}

function detectFromNodeInterfaces() {
  const interfaces = os.networkInterfaces();

  for (const [interfaceName, entries] of Object.entries(interfaces)) {
    if (virtualInterfacePattern.test(interfaceName)) {
      continue;
    }

    const entry = entries?.find(
      (item) => item.family === 'IPv4' && !item.internal && isUsableIpv4(item.address)
    );

    if (entry) {
      return {
        address: entry.address,
        interfaceName,
        source: 'networkInterfaces',
      };
    }
  }

  return null;
}

function detectLanIpv4() {
  return detectFromIpconfig() || detectFromNodeInterfaces();
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--host' && next) {
      options.host = next;
      index += 1;
    } else if (arg === '--port' && next) {
      options.port = Number(next);
      index += 1;
    } else if (arg === '--env-file' && next) {
      options.envFiles = [next];
      index += 1;
    } else if (arg === '--usb-reverse') {
      options.usbReverse = true;
    }
  }

  return options;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
}

function writeEnvFile(filePath, values) {
  const lines = readEnvFile(filePath);
  const seenKeys = new Set();
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);

    if (!match || !(match[1] in values)) {
      return line;
    }

    seenKeys.add(match[1]);
    return `${match[1]}=${values[match[1]]}`;
  });

  Object.entries(values).forEach(([key, value]) => {
    if (!seenKeys.has(key)) {
      nextLines.push(`${key}=${value}`);
    }
  });

  const header =
    lines.length > 0
      ? ''
      : '# Archivo local generado por npm run device:lan. No versionar.\n';
  fs.writeFileSync(filePath, `${header}${nextLines.filter((line, index) => line || index < nextLines.length - 1).join('\n')}\n`);
}

function configureLocalEnv(options = {}) {
  const port = options.port || defaultBackendPort;
  const detected = options.host
    ? { address: options.host, interfaceName: 'manual', source: 'argument' }
    : detectLanIpv4();

  if (!detected?.address || !isUsableIpv4(detected.address)) {
    throw new Error(
      'No pude detectar una IPv4 LAN real. Usa --host 192.168.X.X o revisa que Wi-Fi/Ethernet este activo.'
    );
  }

  const apiHost = options.usbReverse ? '127.0.0.1' : detected.address;
  const values = {
    MANECOMB_ANDROID_CLEARTEXT: '1',
    MANECOMB_API_TIMEOUT_MS: '15000',
    MANECOMB_API_URL: `http://${apiHost}:${port}/api`,
    MANECOMB_LAN_HOST: detected.address,
    MANECOMB_SOCKET_URL: `http://${apiHost}:${port}`,
  };
  const envFiles = (options.envFiles || ['.env.local', '.env']).map((fileName) =>
    path.resolve(projectRoot, fileName)
  );

  envFiles.forEach((envFile) => writeEnvFile(envFile, values));

  return {
    apiUrl: values.MANECOMB_API_URL,
    envFiles,
    host: detected.address,
    interfaceName: detected.interfaceName,
    mode: options.usbReverse ? 'usb-reverse' : 'lan',
    socketUrl: values.MANECOMB_SOCKET_URL,
    source: detected.source,
    values,
  };
}

function main() {
  try {
    const result = configureLocalEnv(parseArgs(process.argv.slice(2)));

    console.log(`[device:lan] IPv4 LAN: ${result.host} (${result.interfaceName}, ${result.source})`);
    console.log(`[device:lan] Modo: ${result.mode}`);
    console.log(`[device:lan] API: ${result.apiUrl}`);
    console.log(`[device:lan] Socket: ${result.socketUrl}`);
    result.envFiles.forEach((envFile) => {
      console.log(`[device:lan] Actualizado: ${path.relative(projectRoot, envFile)}`);
    });
  } catch (error) {
    console.warn(`[device:lan] ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  configureLocalEnv,
  detectLanIpv4,
  isUsableIpv4,
};

if (require.main === module) {
  main();
}
