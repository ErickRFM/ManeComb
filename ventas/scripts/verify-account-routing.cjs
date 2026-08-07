const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const routing = read('src/utils/account-routing.ts');
const access = read('features/portal/utils/access.ts');
const app = read('src/App.tsx');
const authScreen = read('screens/sales-auth-screen.tsx');
const salesScreen = read('screens/sales-screen.tsx');
const planCard = read('screens/sales/components/plan-card.tsx');
const recoveryScreen = read('screens/password-recovery/password-recovery-request-screen.tsx');
const checkoutScreen = read('screens/plan-checkout-screen.tsx');
const checkoutPaymentSection = read('screens/checkout/components/checkout-payment-section.tsx');

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

if (!access.includes("explicitChannel === 'company_portal'")) {
  throw new Error('El Portal debe consumir el canal company_portal emitido por el backend.');
}

const capabilityContracts = [
  "user.capabilities!.includes('portal.access')",
  "users: 'users.manage'",
  "billing: 'billing.manage'",
  "vehicles: 'vehicles.manage'",
  "routes: 'routes.manage'",
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

if (routing.includes("accountType === 'company_owner' ||") || routing.includes('accountType === "company_owner" ||')) {
  throw new Error('Regresó la clasificación permisiva accountType OR role.');
}

if (!routing.includes("channel === 'mobile_operations') return '/acceso-operativo'")) {
  throw new Error('La cuenta operativa debe ir al aviso de frontera, no a una ruta operativa web.');
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
  throw new Error('El guard global del Portal no exige el canal canónico.');
}

if (!app.includes("isOperationalNoticeRoute && getAccountChannel(user) !== 'mobile_operations'")) {
  throw new Error('El aviso de frontera no está protegido por mobile_operations.');
}

const noticeContracts = [
  'CUENTA OPERATIVA',
  'Continúa en la app móvil',
  'Esta cuenta pertenece a Mobile.',
  'Esta cuenta mobile_operations no puede entrar al Portal empresarial.',
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
  "paymentMethod = effectiveRequestTrial ? 'trial' : method",
  "router.replace((receiptIsActive ? '/portal/onboarding' : '/portal/plan') as never)",
];

const checkoutSources = `${checkoutScreen}\n${read('features/commercial/hooks/use-checkout-experience.ts')}`;
for (const contract of trialCheckoutContracts) {
  if (!checkoutSources.includes(contract)) {
    throw new Error(`El checkout no conserva el contrato trial → Portal: ${contract}`);
  }
}

const trialPaymentUiContracts = [
  "providerMode === 'unavailable' && !requestTrial",
  'Acceso de prueba sin pago',
  'No depende de Mercado Pago, tarjeta ni SPEI',
  'La prueba se activa en tu cuenta sin cobro y sin depender del proveedor de pagos.',
];

for (const contract of trialPaymentUiContracts) {
  if (!checkoutPaymentSection.includes(contract)) {
    throw new Error(`La UI de trial volvió a depender del proveedor de pagos: ${contract}`);
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

console.log('Canonical channels, capabilities, product boundaries, checkout intent, provider readiness and trial → Portal verified.');
