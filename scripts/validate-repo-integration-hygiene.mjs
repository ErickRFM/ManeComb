import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

function path(relativePath) {
  return resolve(root, relativePath);
}

function read(relativePath) {
  return readFileSync(path(relativePath), 'utf8');
}

function requireAbsent(relativePath, reason) {
  if (existsSync(path(relativePath))) {
    problems.push(`${relativePath}: ${reason}`);
  }
}

function requireContains(relativePath, pattern, reason) {
  const source = read(relativePath);
  if (!pattern.test(source)) {
    problems.push(`${relativePath}: ${reason}`);
  }
}

for (const [relativePath, reason] of [
  [
    'backend/modules/communication/templates/base.js',
    'copia huérfana del template canónico de communication-service',
  ],
  [
    'backend/modules/communication/templates/components.js',
    'copia huérfana de componentes canónicos de communication-service',
  ],
  [
    'admin-global/src/features/auth/screens/placeholder-screen.tsx',
    'pantalla obsoleta de “En construcción” que no pertenece al router activo',
  ],
  [
    'docs/hotfix/.keep',
    'marcador vacío innecesario en un directorio que ya contiene documentación',
  ],
]) {
  requireAbsent(relativePath, reason);
}

requireContains(
  'backend/modules/communication/index.js',
  /require\(["']\.\/communication\.logger["']\)/,
  'el adapter debe activar el bridge hacia el logger central de ManeComb'
);
requireContains(
  'backend/modules/communication/index.js',
  /\blogger\s*,/,
  'el logger exportado debe ser el bridge configurado y no un export directo sin wiring'
);

const backendPackage = JSON.parse(read('backend/package.json'));
const watch = backendPackage.nodemonConfig?.watch || [];
for (const requiredWatch of ['src', 'modules', '../communication-service/src']) {
  if (!watch.includes(requiredWatch)) {
    problems.push(`backend/package.json: nodemon no observa ${requiredWatch}`);
  }
}

const themeHook = read('mobile/src/hooks/use-app-theme.ts');
if (!themeHook.includes('getThemePreferenceScope')) {
  problems.push('mobile/src/hooks/use-app-theme.ts: falta la autoridad de tema por cuenta');
}
if (themeHook.includes('setThemeMode: state.setThemeMode')) {
  problems.push('mobile/src/hooks/use-app-theme.ts: volvió a conectarse al setter global legado');
}

const commercialRc = path('RC-VENTAS-PLANES-FINAL-01.md');
if (!existsSync(commercialRc) || statSync(commercialRc).size < 200) {
  problems.push('RC-VENTAS-PLANES-FINAL-01.md: evidencia comercial vacía o incompleta');
} else {
  const source = read('RC-VENTAS-PLANES-FINAL-01.md');
  if (!source.includes('backend/src/config/commercial-plans.js')) {
    problems.push('RC-VENTAS-PLANES-FINAL-01.md: no identifica la autoridad ejecutable de planes');
  }
}

if (problems.length > 0) {
  console.error('Repo integration hygiene failed:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log('Repo integration hygiene valid.');
