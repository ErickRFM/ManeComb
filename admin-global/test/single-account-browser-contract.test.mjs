import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');

const guard = read('src/features/auth/components/single-browser-account-guard.tsx');
const main = read('src/main.tsx');
const routeGuard = read('src/features/auth/components/route-guard.tsx');

const required = [
  ['manecomb-platform-active-identity:v1', 'Debe existir una autoridad explícita de identidad Admin activa entre pestañas.'],
  ['new BroadcastChannel(IDENTITY_CHANNEL)', 'Admin debe coordinar cambios de identidad entre pestañas.'],
  ["window.addEventListener('storage', handleStorage)", 'Admin debe observar cambios de sesión persistida entre pestañas.'],
  ['marker.identity !== currentUserId', 'Solo una identidad Admin distinta debe provocar el relevo.'],
  ['window.location.reload();', 'La pestaña Admin vieja debe adoptar la sesión vigente mediante recarga.'],
  ['current?.tabId === TAB_ID', 'Una pestaña Admin solo puede retirar su propio marcador.'],
];

for (const [contract, message] of required) {
  if (!guard.includes(contract)) throw new Error(message);
}

if (!main.includes('<SingleBrowserAdminAccountGuard>') || !main.includes('</SingleBrowserAdminAccountGuard>')) {
  throw new Error('El guard de identidad Admin única debe envolver toda Admin Global.');
}

if (!routeGuard.includes("if (mode === 'authenticated') return <Redirect href=\"/admin\" />;")) {
  throw new Error('La pantalla de login Admin debe expulsar a una identidad que ya tiene sesión activa en la misma pestaña.');
}

if (/\blogout\s*\(/.test(guard)) {
  throw new Error('Una pestaña Admin vieja no debe cerrar la sesión que acaba de publicar la pestaña nueva.');
}

console.log('Admin Global single-browser account isolation verified.');
