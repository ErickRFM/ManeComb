import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function parseEnv(relativePath) {
  const entries = new Map();
  for (const line of read(relativePath).split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) entries.set(match[1], match[2]);
  }
  return entries;
}

function requireKeys(relativePath, requiredKeys) {
  const entries = parseEnv(relativePath);
  for (const key of requiredKeys) {
    if (!entries.has(key)) fail(`${relativePath}: falta ${key}`);
  }
  return entries;
}

const backendKeys = [
  'HOST', 'PORT', 'LOG_LEVEL', 'TRUST_PROXY', 'RENDER',
  'MONGO_URI', 'MONGO_DB_NAME', 'MONGO_SERVER_SELECTION_TIMEOUT_MS', 'REQUIRE_MONGO',
  'JWT_SECRET', 'CHAT_ENCRYPTION_SECRET', 'ACCESS_TOKEN_TTL', 'REFRESH_TOKEN_TTL_DAYS',
  'PLATFORM_JWT_SECRET', 'PLATFORM_ACCESS_TOKEN_TTL', 'PLATFORM_REFRESH_TOKEN_TTL_DAYS',
  'PLATFORM_MFA_ENCRYPTION_KEY', 'PLATFORM_MFA_CHALLENGE_TTL',
  'CLIENT_ORIGIN', 'APP_URL', 'PASSWORD_RESET_PUBLIC_URL', 'PORTAL_PUBLIC_URL',
  'APP_PUBLIC_URL', 'PUBLIC_WEBHOOK_BASE_URL',
  'MAPBOX_ACCESS_TOKEN', 'MAP_GEOCODING_PROVIDER', 'MAP_ROUTING_PROVIDER',
  'PHOTON_API_URL', 'NOMINATIM_API_URL', 'OSRM_API_URL', 'VALHALLA_API_URL',
  'MAP_HTTP_USER_AGENT', 'DOCUMENT_STORAGE_DRIVER',
  'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
  'COMMERCIAL_BRAND_NAME', 'COMMERCIAL_LEGAL_NAME', 'COMMERCIAL_SUPPORT_EMAIL',
  'COMMERCIAL_SUPPORT_PHONE', 'BANK_TRANSFER_ACCOUNT_NAME', 'BANK_TRANSFER_CLABE',
  'BANK_TRANSFER_BANK_NAME', 'PAYMENT_PROVIDER', 'MERCADO_PAGO_ENV',
  'MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_PUBLIC_KEY',
  'MERCADO_PAGO_WEBHOOK_SECRET', 'MERCADO_PAGO_WEBHOOK_URL',
  'MERCADO_PAGO_SUCCESS_URL', 'MERCADO_PAGO_FAILURE_URL', 'MERCADO_PAGO_PENDING_URL',
  'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'RESEND_REPLY_TO', 'EMAIL_ENABLED',
  'EMAIL_DRY_RUN', 'EMAIL_FROM', 'EMAIL_FROM_NAME', 'EMAIL_REPLY_TO',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM',
  'TURN_URLS', 'TURN_USERNAME', 'TURN_CREDENTIAL', 'TURN_SECRET', 'TURN_REALM',
  'TURN_CREDENTIAL_TTL_SECONDS', 'SENTRY_DSN', 'SENTRY_ENVIRONMENT',
  'AUDIO_TRANSCRIPTION_PROVIDER', 'AUDIO_TRANSCRIPTION_API_URL',
  'AUDIO_TRANSCRIPTION_API_KEY', 'AUDIO_TRANSCRIPTION_MODEL',
  'AUDIO_TRANSCRIPTION_LANGUAGE', 'REDIS_URL', 'ENABLE_REDIS', 'ENABLE_QUEUES',
  'REDIS_PERSISTENCE_ENABLED', 'REDIS_MAXMEMORY_POLICY',
  'AUTO_ROUTE_LEARNING_ENABLED', 'AUTO_ROUTE_REVIEW_ENABLED',
  'AUTO_ROUTE_ALGORITHM_VERSION', 'AUTO_ROUTE_GEOMETRY_VERSION',
  'AUTO_ROUTE_ENDPOINT_GRID_DEGREES', 'AUTO_ROUTE_CORRIDOR_GRID_METERS',
  'AUTO_ROUTE_CORRIDOR_SAMPLE_POINTS', 'AUTO_ROUTE_MIN_CORRIDOR_OVERLAP',
  'AUTO_ROUTE_MAX_CORRIDOR_DISTANCE_METERS', 'AUTO_ROUTE_MAX_LENGTH_DIFFERENCE_RATIO',
  'AUTO_ROUTE_MAX_ACCURACY_METERS', 'AUTO_ROUTE_MAX_GAP_SECONDS',
  'AUTO_ROUTE_MAX_SPEED_KMH', 'AUTO_ROUTE_MIN_DISTANCE_METERS',
  'AUTO_ROUTE_MIN_DURATION_SECONDS', 'AUTO_ROUTE_MIN_EVIDENCE_COUNT',
  'AUTO_ROUTE_MIN_POINT_COUNT', 'AUTO_ROUTE_SIMPLIFY_TOLERANCE_METERS'
];

const backend = requireKeys('backend/.env.example', backendKeys);
const ventas = requireKeys('ventas/.env.example', [
  'VITE_API_URL', 'VITE_SOCKET_URL', 'VITE_MAPBOX_ACCESS_TOKEN'
]);
const mobile = requireKeys('mobile/.env.example', [
  'MANECOMB_APP_ENV', 'MANECOMB_API_URL', 'MANECOMB_SOCKET_URL',
  'MANECOMB_API_TIMEOUT_MS', 'MANECOMB_GOOGLE_MAPS_API_KEY',
  'MANECOMB_ANDROID_CLEARTEXT'
]);
const admin = requireKeys('admin-global/.env.example', ['API_PORT', 'VITE_API_URL']);
const mobileProduction = requireKeys('mobile/.env.production', [
  'MANECOMB_APP_ENV', 'MANECOMB_API_URL', 'MANECOMB_SOCKET_URL',
  'MANECOMB_API_TIMEOUT_MS', 'MANECOMB_ANDROID_CLEARTEXT'
]);

if (backend.get('PAYMENT_PROVIDER') === 'test') {
  fail('backend/.env.example: PAYMENT_PROVIDER=test no es un valor seguro');
}
if (backend.get('EMAIL_DRY_RUN') !== 'true') {
  fail('backend/.env.example: EMAIL_DRY_RUN debe ser true por defecto');
}
if (backend.get('CLIENT_ORIGIN')?.includes('*') && !backend.get('CLIENT_ORIGIN')?.includes('*.manecomb1.pages.dev')) {
  fail('backend/.env.example: CLIENT_ORIGIN no debe usar wildcard global');
}
for (const requiredOrigin of ['https://admin.manecomb.com', 'http://localhost:5174']) {
  if (!backend.get('CLIENT_ORIGIN')?.includes(requiredOrigin)) {
    fail(`backend/.env.example: CLIENT_ORIGIN debe incluir ${requiredOrigin}`);
  }
}

for (const [name, entries] of [
  ['ventas/.env.example', ventas],
  ['mobile/.env.example', mobile],
  ['admin-global/.env.example', admin],
  ['mobile/.env.production', mobileProduction]
]) {
  for (const [key, value] of entries) {
    if (/SECRET|PASSWORD|PRIVATE_KEY|ACCESS_TOKEN|AUTH_TOKEN|CLABE/.test(key) && value.trim()) {
      fail(`${name}: ${key} no debe contener un valor versionado`);
    }
  }
}

if (mobileProduction.get('MANECOMB_APP_ENV') !== 'production') {
  fail('mobile/.env.production: MANECOMB_APP_ENV debe ser production');
}
for (const key of ['MANECOMB_API_URL', 'MANECOMB_SOCKET_URL']) {
  if (!String(mobileProduction.get(key) || '').startsWith('https://')) {
    fail(`mobile/.env.production: ${key} debe usar HTTPS`);
  }
}

const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);
const allowedRuntimeEnv = new Set(['mobile/.env.production']);
for (const file of tracked) {
  if (file.split('/').some((part) => part.startsWith('.tmp-'))) {
    fail(`Git contiene un temporal RC: ${file}`);
  }
  if (basename(file).startsWith('.env') && !file.endsWith('.env.example') && !allowedRuntimeEnv.has(file)) {
    fail(`Git contiene un archivo de entorno no permitido: ${file}`);
  }
}

for (const file of ['ventas/public/_redirects', 'admin-global/public/_redirects']) {
  if (read(file).trim() !== '/* /index.html 200') {
    fail(`${file}: fallback SPA invalido`);
  }
}

const ci = read('.github/workflows/ci.yml');
if (ci.includes('VITE_API_URL: https://manecomb.onrender.com')) {
  fail('CI no debe depender del backend real de Produccion para compilar');
}

const backendPackage = JSON.parse(read('backend/package.json'));
const platformTestCommand = backendPackage.scripts?.['test:platform'] || '';
for (const testFile of ['platform-auth.test.js', 'platform-mfa.test.js', 'platform-api-base.test.js', 'platform-security-config.test.js', 'platform-companies.test.js', 'platform-operations.test.js', 'platform-governance.test.js']) {
  if (!platformTestCommand.includes(testFile)) fail(`backend/package.json: test:platform no ejecuta ${testFile}`);
}
if (!String(backendPackage.scripts?.test || '').includes('npm run test:platform')) {
  fail('backend/package.json: npm test debe ejecutar test:platform');
}

const adminPackage = JSON.parse(read('admin-global/package.json'));
const adminTestCommand = adminPackage.scripts?.test || '';
for (const testFile of ['p1-contract.test.mjs', 'p2-companies-contract.test.mjs', 'p3-operations-contract.test.mjs', 'p4-governance-contract.test.mjs']) {
  if (!adminTestCommand.includes(testFile)) fail(`admin-global/package.json: npm test no ejecuta ${testFile}`);
}
if (!ci.includes('name: Test') || !ci.includes('run: npm test')) {
  fail('CI debe ejecutar las pruebas propias de Admin Global');
}

const platformAuthService = read('backend/src/modules/platform/platform-auth-service.js');
const platformAuthMiddleware = read('backend/src/middlewares/platform-auth.js');
if (platformAuthService.includes('isMfaRequired(user.role) && isMfaOperational()')) {
  fail('Platform Auth conserva el patrón MFA fail-open');
}
if (!platformAuthService.includes('mfaRequired && !isMfaOperational()')) {
  fail('Platform Auth no niega login cuando MFA no está operativo');
}
if (!platformAuthMiddleware.includes('mfaRequired && !isMfaOperational()')) {
  fail('Middleware Platform no niega acceso cuando MFA no está operativo');
}
if (!read('backend/src/server.js').includes('assertPlatformSecurityConfiguration')) {
  fail('Backend no valida la configuración Platform antes de escuchar tráfico');
}

const dockerfile = read('backend/Dockerfile');
for (const fragment of ['COPY backend ./backend', 'COPY communication-service ./communication-service']) {
  if (!dockerfile.includes(fragment)) fail(`backend/Dockerfile: falta ${fragment}`);
}

if (failures.length) {
  console.error('Contrato de entorno invalido:');
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('ok - contrato de entornos, artefactos y archivos versionados');
