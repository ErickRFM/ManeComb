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

async function registerOwner(api, { companyName, email, name }) {
  return requestJson(`${api}/auth/register`, {
    method: "POST",
    body: JSON.stringify({
      accountType: "company_owner",
      companyName,
      email,
      name,
      password: "Ruta123!",
      phone: "+52 55 2000 0000"
    })
  });
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
    const registration = await registerOwner(api, {
      companyName,
      email,
      name: "Owner Trial"
    });

    assert.equal(registration.status, 201);
    assert.ok(registration.body.token);
    assert.equal(registration.body.accountChannel, "company_portal");
    assert.equal(registration.body.canAccessPortal, true);
    assert.equal(registration.body.canAccessMobile, false);
    assert.equal(registration.body.mobileBlockReason, "no_plan");

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

    const session = await requestJson(`${api}/auth/me`, {
      headers: { Authorization: `Bearer ${registration.body.token}` }
    });

    assert.equal(session.status, 200);
    assert.equal(session.body.accountChannel, "company_portal");
    assert.equal(session.body.canAccessPortal, true);
    assert.equal(session.body.canAccessMobile, true);
    assert.equal(session.body.canUseOperations, true);
    assert.equal(session.body.mobileBlockReason, null);
    assert.equal(session.body.operationalBlockReason, null);
    assert.equal(session.body.postLoginRoute, "/portal");
    assert.equal(session.body.subscription.status, "trial");
    assert.equal(session.body.tenant.status, "active");

    const portal = await requestJson(`${api}/portal/overview`, {
      headers: { Authorization: `Bearer ${registration.body.token}` }
    });

    assert.equal(portal.status, 200);
    assert.equal(portal.body.ok, true);

    const cardDemoEmail = `trial-card-${Date.now()}@manecomb.test`;
    const cardDemoCompany = "ManeComb Card Demo QA";
    const cardRegistration = await registerOwner(api, {
      companyName: cardDemoCompany,
      email: cardDemoEmail,
      name: "Owner Card Demo"
    });

    assert.equal(cardRegistration.status, 201);
    assert.ok(cardRegistration.body.token);

    const cardDemoCheckout = await requestJson(`${api}/commercial/checkout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cardRegistration.body.token}`,
        "Idempotency-Key": `trial-card-${Date.now()}-0001`
      },
      body: JSON.stringify({
        companyName: cardDemoCompany,
        contactName: "Owner Card Demo",
        email: cardDemoEmail,
        paymentMethod: "card",
        phone: "+52 55 2000 0000",
        planId: "starter-2",
        requestTrial: true,
        selectedAddOns: []
      })
    });

    assert.equal(cardDemoCheckout.status, 201);
    assert.equal(cardDemoCheckout.body.data.paymentProvider, "trial_access");
    assert.equal(cardDemoCheckout.body.data.paymentStatus, "trial_active");
    assert.notEqual(cardDemoCheckout.body.data.paymentStatus, "paid");
    assert.notEqual(cardDemoCheckout.body.data.paymentStatus, "paid_test");
    assert.equal(cardDemoCheckout.body.data.activationStatus, "active");
    assert.equal(cardDemoCheckout.body.data.checkoutUrl, null);

    const cardDemoOrders = await store.listCommercialOrders();
    const cardDemoOrder = cardDemoOrders.find((entry) => entry.email === cardDemoEmail);
    assert.ok(cardDemoOrder);
    assert.equal(cardDemoOrder.paymentMethod, "card");
    assert.equal(cardDemoOrder.requestTrial, true);
    assert.equal(cardDemoOrder.trialStatus, "active");
    assert.equal(cardDemoOrder.activationStatus, "active");
    assert.ok(cardDemoOrder.lastNotificationAt);
    assert.ok(cardDemoOrder.lastNotificationStatus);

    const cardDemoSession = await requestJson(`${api}/auth/me`, {
      headers: { Authorization: `Bearer ${cardRegistration.body.token}` }
    });
    assert.equal(cardDemoSession.status, 200);
    assert.equal(cardDemoSession.body.subscription.status, "trial");
    assert.equal(cardDemoSession.body.canUseOperations, true);
    assert.equal(cardDemoSession.body.canAccessMobile, true);

    console.log("ok - trial activa Portal/Mobile y card demo conserva método sin marcar pago real");
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
