const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const routing = read('src/utils/account-routing.ts');
const access = read('features/portal/utils/access.ts');
const registry = read('features/portal/navigation/portal-route-registry.ts');
const portalLayout = read('features/portal/components/portal-layout.tsx');
const portalActions = read('features/portal/store/portal-actions.ts');
const app = read('src/App.tsx');
const authScreen = read('screens/sales-auth-screen.tsx');
const salesScreen = read('screens/sales-screen.tsx');
const planCard = read('screens/sales/components/plan-card.tsx');
const recoveryScreen = read('screens/password-recovery/password-recovery-request-screen.tsx');
const checkoutScreen = read('screens/plan-checkout-screen.tsx');
const checkoutPaymentSection = read('screens/checkout/components/checkout-payment-section.tsx');
const checkoutExperience = read('features/commercial/hooks/use-checkout-experience.ts');
const checkoutContext = read('src/utils/checkout-context.ts');

const requiredPortalRoles = ['owner', 'admin', 'billing_manager', 'support', 'viewer'];
const requiredChannels = ['company_portal', 'mobile_operations', 'platform_admin', 'blocked'];

for (const role of requiredPortalRoles) {
  if (!access.includes(`'${role}'`)) {
    throw new Error(`Falta el rol de Portal ${role} en la autoridad de acceso.`);
  }
}

for (const channel of requiredChannels) {
  if (!routing.includes(`'${channel}'`)) {
    throw new Error(`Falta el canal canónico ${channel} en el enrutamiento autenticado.`);
  }
}

const capabilityContracts = [
  "return user.capabilities!.includes('portal.access')",
  "users: 'users.manage'",
  "billing: 'billing.manage'",
  "vehicles: 'vehicles.manage'",
  "routes: 'routes.manage'",
  "documents: 'documents.manage'",
  "incidents: 'incidents.manage'",
  "analytics: 'analytics.view'",
  'user!.capabilities!.includes(PORTAL_CAPABILITIES[permission])',
];

for (const contract of capabilityContracts) {
  if (!access.includes(contract)) {
    throw new Error(`El Portal no consume la capacidad canónica: ${contract}`);
  }
}

if (!access.includes("user.accountType === 'company_owner' && isPortalRole(user.role)")) {
  throw new Error('La compatibilidad heredada debe usar accountType AND role y fallar cerrada.');
}

if (access.includes("explicitChannel === 'company_portal' && user.capabilities")) {
  throw new Error('accountChannel volvió a limitar una identidad que ya trae capabilities explícitas.');
}

if (routing.includes("accountType === 'company_owner' ||") || routing.includes('accountType === "company_owner" ||')) {
  throw new Error('Regresó la clasificación permisiva accountType OR role.');
}

if (!routing.includes("channel === 'mobile_operations') return '/acceso-operativo'")) {
  throw new Error('La cuenta operativa debe ir al aviso de frontera, no a una ruta operativa web.');
}

const portalRouteContracts = [
  "'/portal/usuarios': { title: 'Equipo', permission: 'users' }",
  "'/portal/unidades': { title: 'Unidades', permission: 'vehicles' }",
  "'/portal/rutas': { title: 'Rutas', permission: 'routes' }",
  "'/portal/plan': { title: 'Mi plan', permission: 'billing' }",
  "'/portal/documentos': { title: 'Documentos', permission: 'documents' }",
  "'/portal/incidencias': { title: 'Incidencias', permission: 'incidents' }",
];

for (const contract of portalRouteContracts) {
  if (!registry.includes(contract)) {
    throw new Error(`El registro de rutas del Portal perdió el contrato: ${contract}`);
  }
}

if (registry.includes("'/portal/documentos': { title: 'Documentos', permission: 'billing' }") ||
    registry.includes("'/portal/incidencias': { title: 'Incidencias', permission: 'billing' }")) {
  throw new Error('Documentos o Incidencias volvieron a depender incorrectamente de billing.manage.');
}

if (!app.includes('getPortalRoutePermission(pathname)')) {
  throw new Error('El router debe resolver permisos desde PORTAL_ROUTE_REGISTRY.');
}

if (app.includes('const protectedPortalRoutes')) {
  throw new Error('Regresó una segunda tabla de permisos dentro de App.tsx.');
}

if (!portalLayout.includes('getPortalNavSectionsBySubscription(\n    PORTAL_NAV_SECTIONS,')) {
  throw new Error('El menú debe proyectarse desde el único registro PORTAL_NAV_SECTIONS.');
}

const projectedNavUses = portalLayout.match(/visibleNavSections\.map/g) || [];
if (projectedNavUses.length !== 2) {
  throw new Error('Los menús desktop y mobile deben consumir la misma proyección de navegación.');
}

if (portalLayout.includes('const navSections')) {
  throw new Error('Regresó una segunda autoridad local de navegación en PortalLayout.');
}

const portalBootContracts = [
  'getPortalRouteLoadScope(pathname)',
  "case 'account':",
  'loadAll({ includeBilling: false })',
  "case 'billing':",
  'loadBilling()',
  "case 'overview':",
  'loadOverview()',
  "includeBilling ? getAccountInvoicesRequest() : Promise.resolve([])",
  'lastFullLoadIncludedBilling',
];

for (const contract of portalBootContracts) {
  const source = contract.includes('getAccountInvoicesRequest') || contract === 'lastFullLoadIncludedBilling'
    ? portalActions
    : portalLayout;
  if (!source.includes(contract)) {
    throw new Error(`El arranque del Portal perdió el alcance por capabilities: ${contract}`);
  }
}

const forbiddenSalesOperationalRoutes = [
  "case '/mapa':",
  "case '/radio':",
  "return '/mapa'",
  "return '/radio'",
  '<OperationalHandoff',
];

for (const forbidden of forbiddenSalesOperationalRoutes) {
  if (app.includes(forbidden) || routing.includes(forbidden)) {
    throw new Error(`Ventas todavía conserva una ruta operativa prohibida: ${forbidden}`);
  }
}

if (!app.includes('isPortalRoute && !canAccessPortal(user)')) {
  throw new Error('El guard global del Portal no exige portal.access/capability compatible.');
}

if (!app.includes("getAccountChannel(user) !== 'mobile_operations'") || !app.includes('|| canAccessPortal(user)')) {
  throw new Error('El aviso operativo debe respetar mobile_operations sin bloquear identidades con Portal autorizado.');
}

if (!app.includes('if (!isHydrated)')) {
  throw new Error('El router debe fallar cerrado hasta completar la hidratación de sesión.');
}

const noticeContracts = [
  'CUENTA OPERATIVA',
  'Continúa en la app móvil',
  'Esta identidad tiene acceso a la operación móvil de ManeComb.',
  'El canal principal orienta el destino inicial; los permisos de la cuenta determinan los productos y funciones disponibles.',
  'Cerrar sesión',
  '<OperationalAccountNotice />',
];

for (const contract of noticeContracts) {
  if (!app.includes(contract)) {
    throw new Error(`Falta el mensaje canónico de frontera de producto: ${contract}`);
  }
}

if (!app.includes("case '/acceso-operativo':")) {
  throw new Error('Falta el aviso web para cuentas mobile_operations.');
}

if (!app.includes("case '/acceso-restringido':")) {
  throw new Error('Falta la salida cerrada para identidades incompatibles.');
}

if (!app.includes("case '/acceso-admin':")) {
  throw new Error('Falta la separación visible del canal Platform.');
}

const checkoutGuard = authScreen.indexOf('if (selectedPlanId)');
const channelRedirect = authScreen.indexOf('if (isCustomerAccount(user))');

if (checkoutGuard < 0 || channelRedirect < 0 || checkoutGuard > channelRedirect) {
  throw new Error('La intención de compra debe resolverse antes del redirect por canal.');
}

const checkoutContracts = [
  'saveCheckoutContext(selectedPlanId, routeRequestsTrial)',
  'buildPaymentRoute(selectedPlanId, routeRequestsTrial)',
  "buildRecoveryRoute('/ventas/recuperar-contrasena'",
  'planId: selectedPlanId',
  'requestTrial: routeRequestsTrial',
];

for (const contract of checkoutContracts) {
  if (!authScreen.includes(contract)) {
    throw new Error(`La autenticación no preserva la intención de compra: ${contract}`);
  }
}

const trialContracts = [
  'onTrial={isPublicDemoPlan(plan) ? () => goToPlanCheckout(plan, true) : undefined}',
  'isPublicDemoPlan(plan) && Number(plan.trialDays) > 0',
  '`Usar demo ${plan.trialDays} días`',
];

for (const contract of trialContracts) {
  if (!salesScreen.includes(contract)) {
    throw new Error(`La landing no conserva la demo canónica y su intención: ${contract}`);
  }
}

const trialButtonContracts = [
  'const showTrialAction = Boolean(onTrial && trialLabel);',
  'accessibilityLabel={`${trialLabel}: ${plan.name}`}',
  'onPress={onTrial}',
  '{trialLabel}',
];

for (const contract of trialButtonContracts) {
  if (!planCard.includes(contract)) {
    throw new Error(`La tarjeta no expone una acción de demo operativa: ${contract}`);
  }
}

const trialCheckoutContracts = [
  "effectiveRequestTrial || providerMode !== 'unavailable'",
  'requestTrial={effectiveRequestTrial}',
  'const trialForSubmit = effectiveRequestTrial || demoTrial;',
  'const paymentMethod: CheckoutPaymentMethod = demoTrial',
  "? 'card'",
  "? 'trial'",
  'const safeAddOns = trialForSubmit ? [] : selectedAddOns;',
  "router.replace((receiptIsActive ? '/portal/onboarding' : '/portal/plan') as never)",
];

const checkoutSources = `${checkoutScreen}\n${checkoutExperience}`;
for (const contract of trialCheckoutContracts) {
  if (!checkoutSources.includes(contract)) {
    throw new Error(`El checkout no conserva el contrato trial → Portal: ${contract}`);
  }
}

const demoCardContracts = [
  "selectedPlan.trialEligible === true",
  "Number(selectedPlan.units) === 2",
  "Number(selectedPlan.trialDays) === 7",
  "selectedMethod === 'card'",
  'validateTestCard(testCard)',
  'paymentProfile: {',
  'cardLast4: last4',
  'demoTrial: true',
  'selectedAddOns: []',
  "? 'Tarjeta'",
  'Sin tarjeta',
  'Activar prueba ${selectedPlan.trialDays || 7} días',
  'El número completo y el CVV fueron descartados.',
];

for (const contract of demoCardContracts) {
  if (!checkoutSources.includes(contract) && !checkoutPaymentSection.includes(contract)) {
    throw new Error(`La tarjeta de prueba dejó de reutilizar la autoridad de trial segura: ${contract}`);
  }
}

const demoIdempotencyContracts = [
  "const normalizedTrialMethod = safeRequestTrial && requestedMethod === 'card' ? 'card' : 'trial';",
  'paymentMethod: safeRequestTrial ? normalizedTrialMethod : requestedMethod,',
];

for (const contract of demoIdempotencyContracts) {
  if (!checkoutContext.includes(contract)) {
    throw new Error(`La idempotencia volvió a mezclar tarjeta y trial sin tarjeta: ${contract}`);
  }
}

const trialPaymentUiContracts = [
  "providerMode === 'unavailable' && !requestTrial",
  'Prueba sin tarjeta',
  'Durante la prueba no se realizará ningún cargo.',
  'La prueba se activa sin cobro y sin guardar un método de pago.',
];

for (const contract of trialPaymentUiContracts) {
  if (!checkoutPaymentSection.includes(contract)) {
    throw new Error(`La UI de trial volvió a depender del proveedor de pagos: ${contract}`);
  }
}

const operationalGateContracts = [
  'function OperationalPortalGate',
  'isPortalRouteAllowedBySubscription(pathname, resolvedSubscription, true)',
  '<Redirect href="/portal/plan" />',
];

for (const contract of operationalGateContracts) {
  if (!app.includes(contract)) {
    throw new Error(`El Portal no conserva el gate de suscripción activa: ${contract}`);
  }
}

const recoveryContracts = [
  'resolveRecoveryCheckoutContext(params.planId, params.trial, readCheckoutContext())',
  "buildRecoveryRoute('/ventas/login', context)",
  "buildRecoveryRoute('/ventas/recuperacion-enviada', context)",
];

for (const contract of recoveryContracts) {
  if (!recoveryScreen.includes(contract)) {
    throw new Error(`La recuperación no conserva la compra pendiente: ${contract}`);
  }
}

console.log('Canonical channels, capabilities, route registry, scoped boot, product boundaries, checkout intent, provider readiness and trial-card → Portal verified.');
