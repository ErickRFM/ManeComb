const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const planScreen = read('features/portal/screens/portal-plan-screen.tsx');
const planCard = read('features/portal/plan/components/plan-comparison-card.tsx');
const layout = read('features/portal/components/portal-layout.tsx');
const subscriptionGate = read('features/portal/navigation/portal-subscription-access.ts');
const checkout = read('screens/plan-checkout-screen.tsx');

function expect(source, needle, message) {
  if (!source.includes(needle)) {
    throw new Error(message || `Expected source to contain: ${needle}`);
  }
}

expect(planScreen, "const purchaseMode = !hasOperationalPlan;", 'Plan must distinguish purchase from comparison mode.');
expect(planScreen, "? 'Elige tu plan'", 'Fresh accounts must receive purchase-oriented heading.');
expect(planScreen, '<PlanTrialEntry plan={trialPlan} onStart={startTrial} />', 'Fresh accounts must expose the canonical trial entry.');
expect(planScreen, "params: { planId: trialPlan.id, trial: '1' }", 'Trial CTA must reuse the existing checkout trial intent.');
expect(planScreen, "mode={purchaseMode ? 'purchase' : 'compare'}", 'Plan cards must switch semantics by subscription state.');
expect(planScreen, '<PlanPurchasePreview', 'No-plan selection must use purchase summary, not change comparison.');

expect(planCard, "const actionLabel = mode === 'purchase' ? 'Comprar' : 'Comparar';", 'Plan card CTA must say Comprar for no-plan accounts.');

expect(layout, 'getPortalNavSectionsBySubscription', 'Portal layout must filter navigation by subscription authority.');
expect(layout, 'isPortalRouteAllowedBySubscription', 'Portal layout must guard direct routes by subscription authority.');
expect(layout, "return <Redirect href={'/portal/plan' as never} />;", 'Blocked Portal routes must return to plan activation.');

expect(subscriptionGate, "subscription?.isActive === true", 'Operational unlock must use backend isActive authority.');
expect(subscriptionGate, "'/portal/plan'", 'Plan must remain available while operation is locked.');
expect(subscriptionGate, "'/portal/perfil'", 'Account/profile must remain available while operation is locked.');
expect(subscriptionGate, 'const allowPaymentRecovery = authorityReady && needsPaymentRecovery(subscription);', 'Payments must remain hidden until subscription authority is ready.');
expect(subscriptionGate, "item.href === '/portal/pagos' && allowPaymentRecovery", 'Payments must only surface for recovery states while locked.');
expect(subscriptionGate, "label: 'Elegir plan'", 'Locked navigation must use onboarding semantics.');
expect(subscriptionGate, 'if (hasOperationalPortalSubscription(subscription)) return sections;', 'Full navigation must only unlock from the canonical operational subscription authority.');

expect(checkout, 'normalizeTrialIntent', 'Trial must continue through the established checkout authority.');
expect(checkout, 'effectiveRequestTrial', 'Checkout must preserve canonical trial eligibility checks.');

console.log('Plan onboarding gate contract: OK');
