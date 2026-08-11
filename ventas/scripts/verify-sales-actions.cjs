const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function walk(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  return fs.readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) return walk(relativePath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [relativePath] : [];
  });
}

function normalizeRoute(route) {
  const withoutQuery = String(route || '').split('?')[0].split('#')[0];
  if (withoutQuery === '/portal/') return '/portal';
  return withoutQuery.length > 1 ? withoutQuery.replace(/\/$/, '') : withoutQuery;
}

const app = read('src/App.tsx');
const confirmModal = read('src/components/ui/confirm-modal.tsx');
const portalButton = read('features/portal/components/portal-button.tsx');
const users = read('features/portal/screens/portal-users-screen.tsx');
const units = read('features/portal/screens/portal-units-screen.tsx');
const onboarding = read('features/portal/screens/portal-onboarding-screen.tsx');
const documents = read('features/portal/documents/portal-documents-admin.tsx');
const checkout = read('features/commercial/hooks/use-checkout-experience.ts');
const commercialExperience = read('features/commercial/hooks/use-commercial-experience.ts');
const portalRegistry = read('features/portal/navigation/portal-route-registry.ts');
const usersStyles = read('features/portal/users/users.styles.ts');
const unitsStyles = read('features/portal/units/units.styles.ts');
const documentsStyles = read('features/portal/documents/documents.styles.ts');
const incidentsStyles = read('features/portal/incidents/incidents.styles.ts');

// ACTION-01: toda confirmación destructiva puede expresar precondiciones reales en UI.
assert.match(confirmModal, /confirmDisabled\?: boolean/);
assert.match(confirmModal, /const confirmInactive = processing \|\| confirmDisabled/);
assert.match(confirmModal, /accessibilityState=\{\{ busy: processing, disabled: confirmInactive \}\}/);
assert.match(confirmModal, /disabled=\{confirmInactive\}/);
assert.match(confirmModal, /minHeight: DesignSystem\.control\.touch/);

// ACTION-02: el Directorio no deja disparar acciones sabidamente inválidas.
assert.match(users, /confirmDisabled=\{deleteTarget\?\.role === 'owner'\}/);
assert.match(users, /driverImpact\?\.canOffboard/);
assert.match(users, /driverImpact\?\.canDelete/);
assert.match(users, /confirmation\.trim\(\)\.toUpperCase\(\) !== 'ELIMINAR'/);
assert.match(users, /selectedVehicleId === \(driverTarget\.vehicleId \|\| null\)/);
assert.match(users, /· actual/);

// ACTION-03: retiro de unidad refleja la autoridad real del backend.
assert.match(units, /confirmDisabled=\{lifecycleConfirmDisabled\}/);
assert.match(units, /!lifecycleImpact\.canRetire/);
assert.match(units, /retirementReason\.trim\(\)\.length < 3/);
assert.match(units, /Ruta se liberará automáticamente al retirar/);
assert.doesNotMatch(units, />Desasignar ruta<\/PortalButton>/);

// ACTION-04: una key no se marca como compartida antes de una compartición real.
const shareHandler = onboarding.match(/const handleShareKey[\s\S]*?\n  };/)?.[0] || '';
assert.match(shareHandler, /Share\.share/);
assert.match(shareHandler, /Share\.dismissedAction/);
assert.match(shareHandler, /shareActivationKey/);
assert.ok(
  shareHandler.indexOf('Share.share') < shareHandler.indexOf('shareActivationKey'),
  'La key se está registrando como compartida antes de abrir/completar Share.share'
);

// ACTION-05: Documentos bloquea confirmaciones inválidas y entrega feedback al fallar descarga.
assert.match(documents, /confirmDisabled=\{dialogConfirmDisabled\}/);
assert.match(documents, /dialog === 'delete' && notes\.trim\(\)\.length < 3/);
assert.match(documents, /reviewStatus === 'rejected' && !notes\.trim\(\)/);
assert.match(documents, /const downloadDocument = async/);
assert.match(documents, /No fue posible descargar el documento/);
assert.match(documents, /accessibilityRole="radio"/);

// ACTION-06: los fallos asíncronos del checkout no dejan pantallas eternamente "checking".
assert.match(checkout, /service\.getProviderMode\(\)[\s\S]*?\.catch\(\(\) =>/);
assert.match(checkout, /service\.confirmPaymentReturn[\s\S]*?\.catch\(\(\) =>/);
assert.match(checkout, /status: 'error'/);
assert.match(checkout, /Tu selección se conserva/);

// ACTION-07: botones compartidos y superficies de acción intensiva conservan targets táctiles de 44 px.
for (const styleName of ['secondary', 'danger', 'icon']) {
  const block = portalButton.match(new RegExp(`${styleName}: \\{([\\s\\S]*?)\\n  \\},`));
  assert.ok(block, `No se encontró el estilo ${styleName} de PortalButton`);
  assert.match(block[1], /borderWidth: 1/);
}
assert.match(portalButton, /sizeSm:\s*\{[\s\S]*?minHeight: DesignSystem\.control\.touch/);
for (const [name, source] of [
  ['Equipo', usersStyles],
  ['Unidades', unitsStyles],
  ['Documentos', documentsStyles],
  ['Incidencias', incidentsStyles],
]) {
  assert.match(source, /DesignSystem\.control\.touch/, `${name} perdió sus targets táctiles canónicos`);
  assert.doesNotMatch(source, /(?:iconAction|statusOption|assignmentChip|quickAction|actionButton):\s*\{[^}]*?(?:height|minHeight):\s*(?:3[0-9]|4[0-3])\b/s, `${name} reintrodujo una acción táctil menor de 44 px`);
}

// ACTION-08: destinos literales de botones/enlaces deben existir en el switch autoritativo de Ventas.
const knownRoutes = new Set();
for (const match of app.matchAll(/case\s+['"]([^'"]+)['"]\s*:/g)) {
  knownRoutes.add(normalizeRoute(match[1]));
}
assert.ok(knownRoutes.has('/ventas') && knownRoutes.has('/portal'), 'No se pudo leer el switch de rutas de Ventas');

for (const match of portalRegistry.matchAll(/^\s*['"](\/portal[^'"]*)['"]\s*:/gm)) {
  assert.ok(knownRoutes.has(normalizeRoute(match[1])), `Ruta del portal sin pantalla registrada: ${match[1]}`);
}

const sourceFiles = [...walk('screens'), ...walk('features'), ...walk('src')];
const unresolved = [];
const patterns = [
  /router\.(?:push|replace)\(\s*['"]([^'"]+)['"]/g,
  /pathname:\s*['"]([^'"]+)['"]/g,
  /<Redirect[^>]+href=['"]([^'"]+)['"]/g,
  /<Link[^>]+href=['"]([^'"]+)['"]/g,
];

for (const relativePath of sourceFiles) {
  const source = read(relativePath);
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const target = normalizeRoute(match[1]);
      if (!target.startsWith('/')) continue;
      if (!knownRoutes.has(target)) unresolved.push(`${relativePath} -> ${target}`);
    }
  }
}

assert.deepEqual(unresolved, [], `Hay botones/enlaces con rutas literales no registradas:\n${unresolved.join('\n')}`);

// ACTION-09: una cuenta recién creada sin snapshot de onboarding no puede romper Plan.
// Backend moderno siempre lo devuelve, pero el frontend debe tolerar la ventana de
// reconciliación y payloads previos durante despliegues sin convertirla en un crash.
assert.match(
  commercialExperience,
  /onboarding\?\.status \?\? overview\?\.onboarding\?\.status \?\? 'pending'/
);
assert.doesNotMatch(
  commercialExperience,
  /overview\?\.onboarding\.status/,
  'Plan volvió a asumir que overview.onboarding existe en cuentas recién creadas'
);

console.log(`ok - ${sourceFiles.length} archivos de Ventas: rutas, confirmaciones, checkout, accesibilidad, botones y cuenta nueva protegidos`);