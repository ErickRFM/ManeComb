const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..');
const read = (base, relativePath) => fs.readFileSync(path.join(base, relativePath), 'utf8').replace(/\r\n/g, '\n');

const guard = read(root, 'src/session/single-browser-account-guard.tsx');
const main = read(root, 'src/main.tsx');
const auth = read(root, 'screens/sales-auth-screen.tsx');
const shared = read(repoRoot, 'shared/browser-session/single-browser-identity.ts');

const requiredSharedContracts = [
  ["new BroadcastChannel(channelName)", 'Debe existir coordinación entre pestañas aunque la persistencia de storage esté restringida.'],
  ["window.addEventListener('storage', storageListener)", 'Debe existir fallback por evento storage entre pestañas.'],
  ["marker.identity !== currentIdentity", 'Solo una identidad diferente debe provocar relevo; la misma cuenta puede usar varias pestañas.'],
  ["current?.tabId === tabId", 'Una pestaña solo puede retirar el marcador que ella misma publicó.'],
];

for (const [contract, message] of requiredSharedContracts) {
  if (!shared.includes(contract)) throw new Error(message);
}

const requiredGuardContracts = [
  ["manecomb-ventas-active-identity:v1", 'Debe existir una autoridad explícita de identidad activa entre pestañas.'],
  ["createSingleBrowserIdentityCoordinator", 'Ventas debe consumir la autoridad compartida, no duplicarla.'],
  ["String(user.organizationId || 'no-org')", 'La identidad empresarial debe incluir tenant además de userId.'],
  ["window.location.reload();", 'La pestaña vieja debe recargarse para adoptar o cerrar la sesión vigente.'],
  ["browserIdentityCoordinator.publish(identity)", 'Cada cambio de cuenta debe publicarse al resto de pestañas.'],
];

for (const [contract, message] of requiredGuardContracts) {
  if (!guard.includes(contract)) throw new Error(message);
}

if (!main.includes('<SingleBrowserAccountGuard>') || !main.includes('</SingleBrowserAccountGuard>')) {
  throw new Error('El guard de cuenta única debe envolver toda la aplicación Ventas/Portal.');
}

if (!auth.includes('if (user) {') || !auth.includes('return <Redirect')) {
  throw new Error('La pantalla de autenticación debe expulsar una identidad que ya tenga sesión activa en la misma pestaña.');
}

if (/\bsignOut\s*\(/.test(guard)) {
  throw new Error('Una pestaña vieja no debe ejecutar signOut y borrar credenciales que acaba de publicar la pestaña nueva.');
}

console.log('Ventas single-browser account isolation verified.');
