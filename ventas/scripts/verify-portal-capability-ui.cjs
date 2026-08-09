const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const incidents = read('features/portal/screens/portal-incidents-screen.tsx');
const documents = read('features/portal/documents/portal-documents-admin.tsx');
const users = read('features/portal/screens/portal-users-screen.tsx');
const profile = read('features/portal/screens/portal-profile-screen.tsx');
const appMobile = read('features/portal/screens/portal-app-movil-screen.tsx');
const appTabs = read('features/portal/app-mobile/components/app-mobile-tab-bar.tsx');
const routing = read('src/utils/account-routing.ts');
const portalActions = read('features/portal/store/portal-actions.ts');

const required = [
  [incidents, "hasPortalPermission(user, 'incidents')", 'Incidencias debe autorizar acciones con incidents.manage.'],
  [documents, "hasPortalPermission(user, 'documents')", 'Documentos debe autorizar acciones con documents.manage.'],
  [users, "hasPortalPermission(user, 'users')", 'Equipo debe autorizar acciones con users.manage.'],
  [profile, "hasPortalPermission(user, 'users')", 'Datos de empresa deben autorizarse con users.manage.'],
  [profile, 'const savePersonalProfile = async () =>', 'Perfil personal debe tener guardado independiente.'],
  [profile, 'const saveCompanyProfile = async () =>', 'Datos de empresa deben tener guardado independiente.'],
  [profile, "updateProfile({ name, email, phone })", 'Guardar perfil personal no debe arrastrar datos de empresa.'],
  [appMobile, "hasPortalPermission(user, 'users')", 'App Móvil debe mostrar activación de conductores según users.manage.'],
  [appMobile, "router.push('/portal/onboarding'", 'App Móvil debe enlazar a la autoridad existente de keys.'],
  [routing, 'if (canAccessPortal(user)) return \'/portal\';', 'El destino web debe preferir portal.access sobre accountChannel.'],
  [portalActions, "typeof options?.includeBilling === 'boolean'", 'Los reloads deben preservar el scope autorizado de billing.'],
];

for (const [source, contract, message] of required) {
  if (!source.includes(contract)) throw new Error(message);
}

const forbidden = [
  [incidents, "['owner', 'admin', 'supervisor'].includes(user.role)", 'Incidencias volvió a autorizar por rol hardcodeado.'],
  [documents, "['owner', 'admin', 'supervisor'].includes(user.role)", 'Documentos volvió a autorizar por rol hardcodeado.'],
  [users, "['owner', 'admin'].includes(user.role)", 'Equipo volvió a autorizar por rol hardcodeado.'],
  [profile, 'const saveProfile = async () =>', 'Perfil volvió a mezclar identidad personal y empresa en un solo guardado.'],
  [appMobile, '<PortalAppAdmin', 'El Portal empresarial volvió a exponer el editor global del APK.'],
  [appTabs, "'admin'", 'La navegación de App Móvil volvió a exponer un tab admin global a empresas.'],
];

for (const [source, contract, message] of forbidden) {
  if (source.includes(contract)) throw new Error(message);
}

const portalIndex = routing.indexOf("if (canAccessPortal(user)) return '/portal';");
const mobileIndex = routing.indexOf("if (channel === 'mobile_operations') return '/acceso-operativo';");
if (portalIndex < 0 || mobileIndex < 0 || portalIndex > mobileIndex) {
  throw new Error('portal.access debe resolverse antes del canal móvil en getAuthenticatedHome().');
}

console.log('Portal capability-driven UI, profile authority, app-center boundary and scoped reload contracts verified.');
