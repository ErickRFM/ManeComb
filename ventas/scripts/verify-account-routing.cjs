const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const routing = read('src/utils/account-routing.ts');
const access = read('features/portal/utils/access.ts');
const app = read('src/App.tsx');

const requiredPortalRoles = ['owner', 'admin', 'billing_manager', 'support', 'viewer'];

for (const role of requiredPortalRoles) {
  if (!access.includes(`'${role}'`)) {
    throw new Error(`Falta el rol de Portal ${role} en la autoridad de acceso.`);
  }
}

if (!routing.includes("isCustomerAccount(user) ? '/portal' : '/mapa'")) {
  throw new Error('El enrutamiento autenticado debe separar Portal y acceso operativo.');
}

const handoffContracts = [
  'Tu sesión inició correctamente.',
  'Rol: {role} · Tipo de cuenta: {accountType}',
  'Cerrar sesión',
  '<OperationalHandoff title="Acceso operativo" />',
];

for (const contract of handoffContracts) {
  if (!app.includes(contract)) {
    throw new Error(`Falta el contrato visible de acceso operativo: ${contract}`);
  }
}

if (app.includes('El despliegue web de ventas conserva el acceso, pero no incluye la app móvil')) {
  throw new Error('Regresó el placeholder ambiguo del panel operativo.');
}

console.log('Account routing and operational handoff contract verified.');
