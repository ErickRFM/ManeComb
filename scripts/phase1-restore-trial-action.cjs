const fs = require('node:fs');

const file = 'ventas/screens/sales-screen.tsx';
const source = fs.readFileSync(file, 'utf8');
const before = `                      onPress={() => jumpToPlan(index)}
                      onBuy={() => goToPlanCheckout(plan)}
                      userLabel={buyLabel}`;
const after = `                      onPress={() => jumpToPlan(index)}
                      onBuy={() => goToPlanCheckout(plan)}
                      onTrial={isPublicDemoPlan(plan) ? () => goToPlanCheckout(plan, true) : undefined}
                      trialLabel={
                        isPublicDemoPlan(plan) && Number(plan.trialDays) > 0
                          ? \`Usar demo \${plan.trialDays} días\`
                          : null
                      }
                      userLabel={buyLabel}`;

const count = source.split(before).length - 1;
if (count !== 1) {
  throw new Error(`Se esperaba exactamente una tarjeta de plan y se encontraron ${count}`);
}

const next = source.replace(before, after);
fs.writeFileSync(file, next, 'utf8');
console.log('Trial action connected once to the canonical checkout flow.');
