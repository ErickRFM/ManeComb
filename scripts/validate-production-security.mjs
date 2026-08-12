import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const failures = [];

function fail(message) {
  failures.push(message);
}

function file(relativePath) {
  return resolve(root, relativePath);
}

function read(relativePath) {
  return readFileSync(file(relativePath), 'utf8');
}

function requireContains(relativePath, pattern, message) {
  if (!existsSync(file(relativePath)) || !pattern.test(read(relativePath))) {
    fail(`${relativePath}: ${message}`);
  }
}

function requireAbsent(relativePath, pattern, message) {
  if (existsSync(file(relativePath)) && pattern.test(read(relativePath))) {
    fail(`${relativePath}: ${message}`);
  }
}

const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);

const forbiddenCredentialFiles = [
  /(^|\/)google-services\.json$/i,
  /(^|\/)(service[-_]?account|credentials)[^/]*\.json$/i,
  /\.pem$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.jks$/i,
  /\.keystore$/i,
  /\.mobileprovision$/i,
];

for (const relativePath of tracked) {
  if (forbiddenCredentialFiles.some((pattern) => pattern.test(relativePath))) {
    fail(`Git contiene material privado versionado: ${relativePath}`);
  }
}

const secretPatterns = [
  { name: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'OpenAI secret key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Stripe live secret', pattern: /\bsk_live_[A-Za-z0-9]{20,}\b/ },
  { name: 'credentialed Mongo URI', pattern: /mongodb(?:\+srv)?:\/\/[^\s/:]+:[^\s/@]+@/i },
  { name: 'hard-coded JWT bearer', pattern: /Bearer\s+eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];

const scanRoots = ['backend/', 'communication-service/', 'mobile/', 'ventas/', 'admin-global/', 'shared/', '.github/'];
const textExtensions = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.json', '.jsonc', '.yml', '.yaml', '.xml', '.kt', '.gradle', '.properties', '']);

for (const relativePath of tracked) {
  if (!scanRoots.some((prefix) => relativePath.startsWith(prefix))) continue;
  if (relativePath.endsWith('package-lock.json')) continue;
  if (relativePath.includes('/node_modules/')) continue;

  const absolutePath = file(relativePath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) continue;
  if (!textExtensions.has(extname(relativePath).toLowerCase())) continue;

  let source;
  try {
    source = readFileSync(absolutePath, 'utf8');
  } catch {
    continue;
  }

  for (const secret of secretPatterns) {
    if (secret.pattern.test(source)) {
      fail(`${relativePath}: posible ${secret.name} versionado`);
    }
  }
}

const gitignore = read('.gitignore');
for (const fragment of ['*.pem', '*.p12', '*.pfx', '*.jks', '*.keystore', 'service-account*.json', 'credentials*.json']) {
  if (!gitignore.includes(fragment)) fail(`.gitignore: falta proteger ${fragment}`);
}

requireContains(
  'backend/src/config/env.js',
  /JWT_SECRET\.length\s*<\s*32/,
  'JWT_SECRET debe tener mínimo criptográfico antes del arranque'
);
requireContains(
  'backend/src/utils/password-policy.js',
  /MAX_PASSWORD_BYTES/,
  'falta límite explícito para evitar truncamiento de contraseñas'
);
requireContains(
  'backend/src/utils/password-policy.js',
  /COMMON_PASSWORD_FINGERPRINTS/,
  'falta bloqueo de contraseñas comunes'
);

const originGuard = read('backend/src/middlewares/production-origin-guard.js');
for (const origin of ['https://manecomb.com', 'https://www.manecomb.com', 'https://admin.manecomb.com']) {
  if (!originGuard.includes(origin)) fail(`production-origin-guard: falta ${origin}`);
}
for (const forbiddenOrigin of ['localhost', 'manecomb1.pages.dev', 'manecomb-backend-sandbox.onrender.com']) {
  if (originGuard.includes(`"https://${forbiddenOrigin}`) || originGuard.includes(`"http://${forbiddenOrigin}`)) {
    fail(`production-origin-guard: producción no debe confiar en ${forbiddenOrigin}`);
  }
}
requireContains(
  'backend/src/app.js',
  /app\.use\(productionOriginGuard\);/,
  'el perímetro HTTP debe rechazar orígenes browser no canónicos antes de CORS'
);
requireContains(
  'backend/src/app.js',
  /Cache-Control", "no-store, max-age=0"/,
  'auth/account/platform deben marcarse no-store'
);

requireContains(
  'mobile/src/native/secure-store.ts',
  /WHEN_UNLOCKED_THIS_DEVICE_ONLY/,
  'tokens móviles deben permanecer ligados al dispositivo y no exportables por backup'
);
requireContains(
  'mobile/.env.production',
  /^MANECOMB_ANDROID_CLEARTEXT=0$/m,
  'producción móvil debe prohibir HTTP cleartext'
);
requireAbsent(
  'mobile/android/app/src/main/AndroidManifest.xml',
  /android\.permission\.SYSTEM_ALERT_WINDOW/,
  'SYSTEM_ALERT_WINDOW no debe solicitarse sin un consumidor explícito'
);
requireContains(
  'mobile/android/app/src/main/AndroidManifest.xml',
  /android:allowBackup="false"/,
  'la aplicación debe impedir backups del contenedor privado'
);
requireContains(
  'mobile/android/app/src/main/AndroidManifest.xml',
  /android:host="www\.manecomb\.com" android:path="\/reset-password"/,
  'el dominio www debe resolver el flujo seguro de recuperación móvil'
);

const ventasHeaders = read('ventas/public/_headers');
for (const fragment of [
  'Strict-Transport-Security: max-age=63072000; includeSubDomains',
  "Content-Security-Policy: default-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
  'X-Content-Type-Options: nosniff',
]) {
  if (!ventasHeaders.includes(fragment)) fail(`ventas/public/_headers: falta ${fragment}`);
}
if (ventasHeaders.includes('manecomb-backend-sandbox.onrender.com')) {
  fail('ventas/public/_headers: producción todavía permite el backend sandbox');
}

const adminHeaders = read('admin-global/public/_headers');
for (const fragment of [
  'Referrer-Policy: no-referrer',
  'Strict-Transport-Security: max-age=63072000; includeSubDomains',
  "Content-Security-Policy: default-src 'self'",
  'https://admin-api.manecomb.com',
  'Cache-Control: no-store',
]) {
  if (!adminHeaders.includes(fragment)) fail(`admin-global/public/_headers: falta ${fragment}`);
}

const vite = read('ventas/vite.config.js');
if (!vite.includes('assertNoPrivateClientEnvironment')) {
  fail('ventas/vite.config.js: el build web no bloquea secretos VITE_*');
}
if (!vite.includes("requireHttps: productionBuild")) {
  fail('ventas/vite.config.js: producción no exige HTTPS para API/Socket');
}

const ventasEnv = read('ventas/.env.example');
if (!ventasEnv.includes('variables VITE_* terminan dentro del bundle público')) {
  fail('ventas/.env.example: falta advertencia explícita de variables públicas');
}

if (failures.length) {
  console.error('Production security gate failed:');
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('ok - ManeComb production security gate');
