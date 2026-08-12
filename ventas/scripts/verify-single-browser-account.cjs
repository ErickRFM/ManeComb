const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');

const guard = read('src/session/single-browser-account-guard.tsx');
const main = read('src/main.tsx');
const auth = read('screens/sales-auth-screen.tsx');

const requiredGuardContracts = [
  ["manecomb-ventas-active-identity:v1", 'Debe existir una autoridad explícita de identidad activa entre pestañas.'],
  ["new BroadcastChannel(IDENTITY_CHANNEL)", 'Debe existir coordinación entre pestañas aunque la persistencia de storage esté restringida.'],
  ["window.addEventListener('storage', handleStorage)", 'Debe existir fallback por evento storage entre pestañas.'],
  ["marker.identity !== currentIdentity", 'Solo una identidad diferente debe provocar relevo; la misma cuenta puede usar varias pestañas.'],
  ["window.location.reload();", 'La pestaña vieja debe recargarse para adoptar o cerrar la sesión vigente.'],
  ["current?.tabId === TAB_ID", 'Una pestaña solo puede retirar el marcador que ella misma publicó.'],
  ["String(user.organizationId || 'no-org')", 'La identidad empresarial debe incluir tenant además de userId.'],
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
