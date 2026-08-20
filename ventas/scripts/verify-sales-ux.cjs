const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
}

const salesScreen = read('screens/sales-screen.tsx');
const siteHeader = read('screens/sales/components/site-header.tsx');
const siteFooter = read('screens/sales/components/site-footer.tsx');
const planCard = read('screens/sales/components/plan-card.tsx');
const faqItem = read('screens/sales/components/faq-item.tsx');
const sectionHeading = read('screens/sales/components/section-heading.tsx');
const immersiveBackground = read('screens/sales/components/immersive-background.tsx');
const authScreen = read('screens/sales-auth-screen.tsx');
const authUtils = read('screens/auth/auth.utils.ts');
const passwordRequirements = read('screens/auth/components/auth-password-requirements.tsx');
const passwordRecoveryUtils = read('screens/password-recovery/password-recovery.utils.ts');
const paymentSection = read('screens/checkout/components/checkout-payment-section.tsx');
const checkoutStepper = read('screens/checkout/components/checkout-stepper.tsx');
const checkoutSummary = read('screens/checkout/components/checkout-order-summary.tsx');
const commercialFaq = read('src/constants/commercial.ts');

// UX-01: la demo pública entra por el camino de menor fricción, pero tarjeta sigue disponible.
assert.match(paymentSection, /trialDefaultApplied/);
assert.match(paymentSection, /onSelectMethod\('spei'\)/);
assert.match(paymentSection, /label="Sin tarjeta"/);
assert.match(paymentSection, /label="Tarjeta opcional"/);
assert.ok(paymentSection.indexOf('label="Sin tarjeta"') < paymentSection.indexOf('label="Tarjeta opcional"'));

// UX-02: registro/login conserva y explica el plan elegido.
assert.match(authScreen, /TU SELECCIÓN SE CONSERVA/);
assert.match(authScreen, /selectedPlan\.name/);
assert.match(authScreen, /formatCurrency\(selectedPlan\.price\)/);
assert.match(authScreen, /label="Correo o teléfono"/);
assert.match(authScreen, /Crear cuenta y continuar/);
assert.match(authScreen, /La recuperación automática utiliza correo/);

// UX-02B: la contraseña se explica y diagnostica por requisito con semántica Unicode.
assert.match(authUtils, /8 caracteres o más/);
assert.match(authUtils, /Una letra \(incluye ñ y acentos\)/);
assert.match(authUtils, /Un número/);
assert.match(authUtils, /Un carácter especial, como ! @ # \$ % _ -/);
assert.match(authUtils, /const safePassword = String\(password \|\| ''\);/);
assert.ok(authUtils.includes("hasLetter: /\\p{L}/u.test(safePassword)"));
assert.ok(authUtils.includes("hasNumber: /\\p{N}/u.test(safePassword)"));
assert.ok(authUtils.includes("hasSpecial: /[\\p{P}\\p{S}]/u.test(safePassword)"));
assert.doesNotMatch(authUtils, /\[A-Za-z\]|\[\^A-Za-z0-9\]/);
assert.doesNotMatch(authUtils, /hasUppercase|mayúscula obligatoria/i);
assert.match(authScreen, /<AuthPasswordRequirements/);
assert.match(authScreen, /autoComplete=\{isRegister \? 'new-password' : 'current-password'\}/);
assert.match(passwordRequirements, /Las contraseñas no coinciden/);
assert.match(passwordRequirements, /check-circle-outline/);
assert.match(passwordRecoveryUtils, /getRegistrationPasswordChecks/);
assert.match(passwordRecoveryUtils, /isRegistrationPasswordAllowed/);

// UX-03: pricing aparece antes de la descarga de App y el CTA primario hace exactamente lo que promete.
assert.match(salesScreen, /import \{ AppDownloadSection \}/);
assert.ok(salesScreen.indexOf('nativeID="planes"') < salesScreen.indexOf('<AppDownloadSection'));
assert.ok(salesScreen.indexOf('label="Ver planes"') < salesScreen.indexOf('label="Explorar plataforma"'));
assert.match(siteHeader, /label="Ver planes"/);
assert.match(salesScreen, /onBuy=\{\(\) => scrollToSection\('planes'\)\}/);
assert.doesNotMatch(salesScreen, /badge\.toLowerCase\(\)\.includes\('vendido'\)/);
assert.match(salesScreen, /plans\.findIndex\(\(plan\) => isPublicDemoPlan\(plan\)\)/);

// UX-04: la cabecera móvil conserva sesión sin segunda fila redundante; las secciones siguen funcionando en native.
assert.match(siteHeader, /<ActionButton label=\{loginLabel\} icon="login" variant="ghost" compact onPress=\{onLogin\} \/>/);
assert.match(siteHeader, /stacked \? \{ minHeight: 68, paddingVertical: 9 \} : undefined/);
assert.match(siteHeader, /\{!stacked \? <View style=\{styles\.headerNav\}>\{navButtons\}<\/View> : null\}/);
assert.doesNotMatch(siteHeader, /stacked \? \(\s*<View style=\{\[styles\.headerNav/);
assert.match(salesScreen, /nativeSectionOffsets/);
assert.match(salesScreen, /pageRef\.current\?\.scrollTo/);
assert.match(salesScreen, /registerNativeSection\('descargar'\)/);
assert.match(salesScreen, /registerNativeSection\('confianza'\)/);

// UX-05: pricing diferencia selección de marketing y declara el costo del add-on.
assert.match(planCard, /accessibilityState=\{\{ selected: active \}\}/);
assert.match(planCard, /SELECCIONADO/);
assert.match(planCard, /Radio opcional \+\$\{formatCurrency\(plan\.radioAddonPrice \|\| 0\)\} MXN\/mes/);
assert.match(salesScreen, /const showPlanControls = !isDesktop \|\| plans\.length > desktopVisibleCards/);

// UX-06: accesibilidad y confianza pública no dependen de contenido cortado o destinos ficticios.
assert.match(faqItem, /accessibilityState=\{\{ expanded: open \}\}/);
assert.doesNotMatch(faqItem, /maxHeight/);
assert.match(sectionHeading, /accessibilityRole="header"/);
assert.doesNotMatch(siteFooter, /Casos de éxito|Documentación|Cookies|Estado del sistema/);
assert.match(siteFooter, /Soporte comercial/);
assert.match(commercialFaq, /¿La prueba requiere tarjeta\?/);
assert.match(commercialFaq, /¿El precio ya incluye IVA\?/);
assert.match(salesScreen, /CONFIANZA OPERATIVA/);
assert.match(salesScreen, /Roles por organización/);

// UX-07: checkout visualmente corto y motion ambiental limitado.
assert.doesNotMatch(checkoutStepper, /'confirmation' as const/);
assert.match(checkoutSummary, /Cambiar plan/);
assert.match(immersiveBackground, /length: isPhone \? 4 : 6/);
assert.match(immersiveBackground, /length: isPhone \? 8 : 16/);
assert.match(immersiveBackground, /manecombGradientShift 20s/);

console.log('ok - funnel, landing, pricing, accesibilidad, confianza, auth y motion de Ventas están protegidos');
