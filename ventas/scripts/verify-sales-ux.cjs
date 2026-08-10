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

// UX-03: la App aparece antes del pricing y Planes es el CTA primario del hero.
assert.match(salesScreen, /import \{ AppDownloadSection \}/);
assert.ok(salesScreen.indexOf('<AppDownloadSection') < salesScreen.indexOf('nativeID="planes"'));
assert.ok(salesScreen.indexOf('label="Explorar planes"') < salesScreen.indexOf('label="Conocer la plataforma"'));
assert.doesNotMatch(salesScreen, /badge\.toLowerCase\(\)\.includes\('vendido'\)/);
assert.match(salesScreen, /plans\.findIndex\(\(plan\) => isPublicDemoPlan\(plan\)\)/);

// UX-04: navegación móvil comparte estado de sesión y las secciones funcionan también en native.
assert.match(siteHeader, /<ActionButton label=\{loginLabel\} icon="login" variant="ghost" compact onPress=\{onLogin\} \/>/);
assert.match(siteHeader, /minHeight: 44/);
assert.match(salesScreen, /nativeSectionOffsets/);
assert.match(salesScreen, /pageRef\.current\?\.scrollTo/);
assert.match(salesScreen, /registerNativeSection\('descargar'\)/);
assert.match(salesScreen, /registerNativeSection\('confianza'\)/);

// UX-05: pricing diferencia selección de marketing y declara el costo del add-on.
assert.match(planCard, /accessibilityState=\{\{ selected: active \}\}/);
assert.match(planCard, /SELECCIONADO/);
assert.match(planCard, /Radio opcional \+\$\{formatCurrency\(plan\.radioAddonPrice \|\| 0\)\} MXN\/mes/);

// UX-06: accesibilidad y confianza pública no dependen de contenido cortado o destinos ficticios.
assert.match(faqItem, /accessibilityState=\{\{ expanded: open \}\}/);
assert.doesNotMatch(faqItem, /maxHeight/);
assert.match(sectionHeading, /accessibilityRole="header"/);
assert.doesNotMatch(siteFooter, /Casos de éxito|Documentación|Cookies|Estado del sistema/);
assert.match(siteFooter, /Soporte comercial/);
assert.match(commercialFaq, /¿La prueba requiere tarjeta\?/);
assert.match(commercialFaq, /¿El precio ya incluye IVA\?/);

// UX-07: checkout visualmente corto y motion ambiental limitado.
assert.doesNotMatch(checkoutStepper, /'confirmation' as const/);
assert.match(checkoutSummary, /Cambiar plan/);
assert.match(immersiveBackground, /length: isPhone \? 4 : 6/);
assert.match(immersiveBackground, /length: isPhone \? 8 : 16/);
assert.match(immersiveBackground, /manecombGradientShift 20s/);

console.log('ok - funnel, landing, pricing, accesibilidad, confianza y motion de Ventas están protegidos');