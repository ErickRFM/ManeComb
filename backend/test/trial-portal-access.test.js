const assert = require("node:assert/strict");
const http = require("node:http");

process.env.NODE_ENV = "test";
process.env.RENDER = "";
process.env.REQUIRE_MONGO = "false";
process.env.PAYMENT_PROVIDER = "manual";
delete process.env.BANK_TRANSFER_ACCOUNT_NAME;
delete process.env.BANK_TRANSFER_CLABE;
delete process.env.BANK_TRANSFER_BANK_NAME;

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");

async function requestJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  return {
    body: await response.json(),
    status: response.status
  };
}

async function main() {
  const store = createEmbeddedStore();
  const app = createApp({
    store,
    getDbState: () => ({ connected: true, mode: "embedded", message: "trial-portal-test" })
  });
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const api = `http://127.0.0.1:${server.address().port}/api`;

  try {
    const health = await requestJson(`${api}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(health.body.readiness?.payments, {
      mode: "configuration_required",
      provider: "manual",
      ready: false
    });

    const email = `trial-portal-${Date.now()}@manecomb.test`;
    const companyName = "ManeComb Trial QA";
    const registration = await requestJson(`${api}/auth/register`, {
      method: "POST",
      body: JSON.stringify({
        accountType: "company_owner",
        companyName,
        email,
        name: "Owner Trial",
        password: "Ruta123!",
        phone: "+52 55 2000 0000"
      })
    });

    assert.equal(registration.status, 201);
    assert.ok(registration.body.token);

    const checkout = await requestJson(`${api}/commercial/checkout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${registration.body.token}`,
        "Idempotency-Key": `trial-portal-${Date.now()}-0001`
      },
      body: JSON.stringify({
        companyName,
        contactName: "Owner Trial",
        email,
        paymentMethod: "trial",
        phone: "+52 55 2000 0000",
        planId: "starter-2",
        requestTrial: true,
        selectedAddOns: []
      })
    });

    assert.equal(checkout.status, 201);
    assert.equal(checkout.body.data.paymentProvider, "trial_access");
    assert.equal(checkout.body.data.paymentStatus, "trial_active");
    assert.equal(checkout.body.data.activationStatus, "active");
    assert.equal(checkout.body.data.checkoutUrl, null);

    const subscription = await requestJson(`${api}/account/subscription`, {
      headers: { Authorization: `Bearer ${registration.body.token}` }
    });

    assert.equal(subscription.status, 200);
    assert.equal(subscription.body.data.planId, "starter-2");
    assert.equal(subscription.body.data.status, "trial");
    assert.equal(subscription.body.data.isActive, true);
    assert.equal(subscription.body.data.unitsLimit, 2);
    assert.ok(subscription.body.data.expiresAt);

    const portal = await requestJson(`${api}/portal/overview`, {
      headers: { Authorization: `Bearer ${registration.body.token}` }
    });

    assert.equal(portal.status, 200);
    assert.equal(portal.body.ok, true);

    console.log("ok - trial de 7 dias activa cuenta, suscripcion trial y acceso Portal sin proveedor de pagos");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});