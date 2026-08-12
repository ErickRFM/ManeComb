import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(root, '..');
const read = (base, relativePath) => fs.readFileSync(path.join(base, relativePath), 'utf8').replace(/\r\n/g, '\n');

const guard = read(root, 'src/features/auth/components/single-browser-account-guard.tsx');
const main = read(root, 'src/main.tsx');
const routeGuard = read(root, 'src/features/auth/components/route-guard.tsx');
const shared = read(repoRoot, 'shared/browser-session/single-browser-identity.ts');

const requiredShared = [
  ['new BroadcastChannel(channelName)', 'Admin debe coordinar cambios de identidad entre pestañas.'],
  ["window.addEventListener('storage', storageListener)", 'Admin debe observar cambios de sesión persistida entre pestañas.'],
  ['marker.identity !== currentIdentity', 'Solo una identidad distinta debe provocar el relevo.'],
  ['current?.tabId === tabId', 'Una pestaña solo puede retirar su propio marcador.'],
];

for (const [contract, message] of requiredShared) {
  if (!shared.includes(contract)) throw new Error(message);
}

const requiredGuard = [
  ['manecomb-platform-active-identity:v1', 'Debe existir una autoridad explícita de identidad Admin activa entre pestañas.'],
  ['createSingleBrowserIdentityCoordinator', 'Admin debe consumir la autoridad compartida, no duplicarla.'],
  ['window.location.reload();', 'La pestaña Admin vieja debe adoptar la sesión vigente mediante recarga.'],
  ['browserIdentityCoordinator.publish(userId)', 'Cada cambio de identidad Admin debe publicarse al resto de pestañas.'],
];

for (const [contract, message] of requiredGuard) {
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
