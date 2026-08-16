import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const blueprintPath = path.join(root, 'render.yaml');
const failures = [];

function fail(message) {
  failures.push(message);
}

if (!fs.existsSync(blueprintPath)) {
  fail('render.yaml is missing from the repository root');
} else {
  const source = fs.readFileSync(blueprintPath, 'utf8');
  const requiredFragments = [
    'name: manecomb',
    'type: web',
    'runtime: docker',
    'dockerfilePath: ./backend/Dockerfile',
    'dockerContext: .',
    'autoDeployTrigger: checksPass',
    'healthCheckPath: /api/health',
    'key: NODE_ENV',
    'value: production',
    'key: REQUIRE_MONGO',
    'key: MONGO_URI',
    'key: JWT_SECRET',
    'key: CLIENT_ORIGIN',
    'key: DOCUMENT_STORAGE_DRIVER',
    'key: REDIS_URL',
    'key: TURN_URLS',
    'key: PLATFORM_ACCESS_ENFORCEMENT_ENABLED'
  ];

  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) fail(`render.yaml missing required contract fragment: ${fragment}`);
  }

  for (const forbidden of [
    'mongodb+srv://',
    'mongodb://',
    'redis://',
    'rediss://',
    'sk_live_',
    'sk_test_',
    '-----BEGIN PRIVATE KEY-----'
  ]) {
    if (source.includes(forbidden)) fail(`render.yaml contains a forbidden inline secret pattern: ${forbidden}`);
  }

  const lines = source.split(/\r?\n/);
  const secretKeys = new Set([
    'MONGO_URI', 'JWT_SECRET', 'CHAT_ENCRYPTION_SECRET',
    'PLATFORM_JWT_SECRET', 'PLATFORM_MFA_ENCRYPTION_KEY',
    'MAPBOX_ACCESS_TOKEN', 'BANK_TRANSFER_CLABE',
    'MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET',
    'RESEND_API_KEY', 'REDIS_URL', 'TURN_CREDENTIAL', 'TURN_SECRET',
    'FCM_PRIVATE_KEY', 'SENTRY_DSN'
  ]);

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*- key:\s*([A-Z0-9_]+)\s*$/);
    if (!match || !secretKeys.has(match[1])) continue;
    const following = lines.slice(index + 1, index + 4).join('\n');
    if (!/\bsync:\s*false\b/.test(following)) {
      fail(`render.yaml must keep ${match[1]} dashboard-managed with sync:false`);
    }
  }
}

if (failures.length) {
  console.error('Render Blueprint contract validation failed:');
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('ok - render.yaml production contract is versioned and contains no inline secrets');
