const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const routing = read('src/utils/account-routing.ts');
const access = read('features/portal/utils/access.ts');
const app = read('src/App.tsx');

const requiredPortalRoles = ['owner', 'admin', 'billing_manager', 'support', 'viewer'];
const requiredChannels = ['company_portal', 'mobile_operations', 'platform_admin', 'blocked'];

for (const role of requiredPortalRoles) {
  if (!access.includes(`'${role}'`)) {
    throw new Error(`Falta el rol de Portal ${role} en la autoridad de acceso.`);
  }
}

for (const channel of requiredChannels) {
  if (!routing.includes(`'${channel}'`)) {
    throw new Error(`Falta el canal canonico ${channel} en el enrutamiento autenticado.`);
  }
}

if (!access.includes("explicitChannel === 'company_portal'")) {
  throw new Error('El Portal debe consumir el canal company_portal emitido por el backend.');
}

if (!access.includes("user.accountType === 'company_owner' && isPortalRole(user.role)")) {
  throw new Error('La compatibilidad heredada debe usar accountType AND role y fallar cerrada.');
}

if (routing.includes("accountType === 'company_owner' ||") || routing.includes('accountType === "company_owner" ||')) {
  throw new Error('Regreso la clasificacion permisiva accountType OR role.');
}

if (!app.includes('isPortalRoute && !canAccessPortal(user)')) {
  throw new Error('El guard global del Portal no exige el canal canonico.');
}

if (!app.includes("getAccountChannel(user) !== 'mobile_operations'")) {
  throw new Error('El handoff operativo no esta protegido por mobile_operations.');
}

const handoffContracts = [
  'Tu sesión inició correctamente.',
  'Canal: {accountChannel}',
  'Cerrar sesión',
  '<OperationalHandoff title="Acceso operativo" />',
];

for (const contract of handoffContracts) {
  if (!app.includes(contract)) {
    throw new Error(`Falta el contrato visible de acceso operativo: ${contract}`);
  }
}

if (!app.includes("case '/acceso-restringido':")) {
  throw new Error('Falta la salida cerrada para identidades incompatibles.');
}

if (!app.includes("case '/acceso-admin':")) {
  throw new Error('Falta la separacion visible del canal Platform.');
}

console.log('Canonical account channel, Portal guard and operational handoff verified.');
