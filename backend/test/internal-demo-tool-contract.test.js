const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(path.resolve(__dirname, "../scripts/manage-demo-account.js"), "utf8");
const service = fs.readFileSync(path.resolve(__dirname, "../src/services/internal-demo-access.js"), "utf8");

assert.match(script, /const apply = hasFlag\("--apply"\)/);
assert.match(script, /confirmation !== email/);
assert.match(script, /TrialEntitlementModel\.findOne\(\{ organizationId \}\)/);
assert.match(script, /publicTrialPreserved: true/);
assert.match(script, /isInternalDemoOrder\(order\)/);
assert.doesNotMatch(script, /TrialEntitlementModel\.(delete|deleteOne|deleteMany|findOneAndDelete)/);
assert.match(service, /INTERNAL_DEMO_PAYMENT_STATUS = "paid_test"/);
assert.match(service, /INTERNAL_DEMO_PROVIDER = "internal_demo"/);
assert.match(service, /DEFAULT_INTERNAL_DEMO_PLAN_ID = "enterprise-12"/);
assert.match(service, /active_real_paid_subscription/);

console.log("ok - demo interno es dry-run por defecto, preserva trial y falla cerrado ante pago real activo");
