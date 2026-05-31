const assert = require("node:assert/strict");
const http = require("node:http");

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");

async function createTestServer() {
  const store = createEmbeddedStore();
  const app = createApp({
    store,
    getDbState: () => ({
      connected: false,
      mode: "embedded",
      message: "activation-key-test"
    })
  });
  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  return {
    store,
    url: `http://127.0.0.1:${address.port}/api`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      })
  };
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  const payload = await response.json();

  return {
    payload,
    status: response.status
  };
}

async function runActivationKeyFlow() {
  const context = await createTestServer();
  const stamp = Date.now();
  const ownerEmail = `activation-owner-${stamp}@combis.app`;
  const password = "Ruta123!";

  try {
    const registerOwner = await requestJson(`${context.url}/auth/register`, {
      body: JSON.stringify({
        name: "Admin Plan Dos",
        email: ownerEmail,
        password,
        phone: "+52 55 1000 0000",
        companyName: "Plan Dos Combis",
        accountType: "company_owner"
      }),
      method: "POST"
    });

    assert.equal(registerOwner.status, 201);
    const token = registerOwner.payload.token;

    const checkout = await requestJson(`${context.url}/commercial/checkout`, {
      body: JSON.stringify({
        companyName: "Plan Dos Combis",
        contactName: "Admin Plan Dos",
        email: ownerEmail,
        phone: "+52 55 1000 0000",
        planId: "starter-2",
        paymentMethod: "transfer"
      }),
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "POST"
    });

    assert.equal(checkout.status, 201);

    await context.store.updateCommercialOrder(checkout.payload.data.id, {
      paymentStatus: "paid",
      activationStatus: "active",
      status: "active",
      paymentApprovedAt: new Date().toISOString(),
      activatedAt: new Date().toISOString()
    });

    const firstKeyResponse = await requestJson(`${context.url}/admin/activation-keys/generate`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "POST"
    });
    const secondKeyResponse = await requestJson(`${context.url}/admin/activation-keys/generate`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "POST"
    });

    assert.equal(firstKeyResponse.status, 201);
    assert.equal(secondKeyResponse.status, 201);
    assert.equal(secondKeyResponse.payload.data.summary.keysGenerated, 2);
    assert.equal(secondKeyResponse.payload.data.summary.availableSlots, 0);

    const keyOne = firstKeyResponse.payload.data.activationKey.key;
    const keyTwo = secondKeyResponse.payload.data.activationKey.key;

    const ownerAsDriver = await requestJson(`${context.url}/driver/activation/register`, {
      body: JSON.stringify({
        key: keyOne,
        name: "Admin No Debe Cambiar Rol",
        email: ownerEmail,
        password
      }),
      method: "POST"
    });

    assert.equal(ownerAsDriver.status, 409);
    assert.equal(ownerAsDriver.payload.message, "No se pudo activar la cuenta. Intenta nuevamente.");

    const firstDriver = await requestJson(`${context.url}/driver/activation/register`, {
      body: JSON.stringify({
        key: keyOne,
        name: "Conductor Uno",
        email: `conductor-uno-${stamp}@combis.app`,
        password,
        unit: {
          code: "CB-T01",
          plate: "TST-001-A"
        }
      }),
      method: "POST"
    });

    assert.equal(firstDriver.status, 201);
    assert.equal(firstDriver.payload.user.role, "driver");
    assert.equal(firstDriver.payload.user.organizationId, registerOwner.payload.user.organizationId);

    const reusedKey = await requestJson(`${context.url}/driver/activation/register`, {
      body: JSON.stringify({
        key: keyOne,
        name: "Conductor Repetido",
        email: `conductor-repetido-${stamp}@combis.app`,
        password
      }),
      method: "POST"
    });

    assert.equal(reusedKey.status, 409);
    assert.equal(reusedKey.payload.message, "Esta key ya fue usada.");

    const secondDriver = await requestJson(`${context.url}/driver/activation/register`, {
      body: JSON.stringify({
        key: keyTwo,
        name: "Conductor Dos",
        email: `conductor-dos-${stamp}@combis.app`,
        password,
        unit: {
          code: "CB-T02",
          plate: "TST-002-A"
        }
      }),
      method: "POST"
    });

    assert.equal(secondDriver.status, 201);

    const thirdKeyResponse = await requestJson(`${context.url}/admin/activation-keys/generate`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "POST"
    });

    assert.equal(thirdKeyResponse.status, 409);
    assert.equal(
      thirdKeyResponse.payload.message,
      "Ya se alcanzó el límite de conductores del plan."
    );

    console.log("ok - flujo de activation keys respeta plan de 2 combis y bloquea tercer cupo");
  } finally {
    await context.close();
  }
}

runActivationKeyFlow().catch((error) => {
  console.error(error);
  process.exit(1);
});
