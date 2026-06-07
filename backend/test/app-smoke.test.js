const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const mongoose = require("mongoose");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env")
});

const createApp = require("../src/app");
const { connectDB, getDbState } = require("../src/config/db");
const { createEmbeddedStore } = require("../src/data/store");
const { createMongoStore } = require("../src/data/mongo-store");

async function createMongoTestServer() {
  let store;
  let runtimeDbState;

  try {
    await connectDB();
  } catch (error) {
    console.log(
      `warn - MongoDB no disponible para humo completo, se usa store embebido (${error.message || "sin conectividad"})`
    );
  }

  const db = getDbState();

  if (db.connected) {
    store = await createMongoStore();
    runtimeDbState = getDbState;
  } else {
    store = createEmbeddedStore();
    runtimeDbState = () => ({
      connected: false,
      mode: "embedded",
      message: "fallback"
    });
  }

  const app = createApp({
    store,
    getDbState: runtimeDbState
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

async function testCriticalFlows() {
  const context = await createMongoTestServer();

  if (!context) {
    return;
  }

  const stamp = Date.now();
  const email = `smoke-${stamp}@combis.app`;
  const password = "Ruta123!";
  const companyName = `Smoke Fleet ${stamp}`;
  let createdUserId = null;
  let createdTeamUserId = null;

  try {
    const registerResponse = await requestJson(`${context.url}/auth/register`, {
      body: JSON.stringify({
        name: "Smoke Ops",
        email,
        password,
        phone: "+52 55 0000 2222",
        companyName,
        accountType: "company_owner"
      }),
      method: "POST"
    });

    assert.equal(registerResponse.status, 201);
    assert.equal(registerResponse.payload.ok, true);
    createdUserId = registerResponse.payload.user.id;
    assert.equal(registerResponse.payload.user.accountType, "company_owner");
    assert.equal(registerResponse.payload.dashboard, null);
    const token = registerResponse.payload.token;

    const loginResponse = await requestJson(`${context.url}/auth/login`, {
      body: JSON.stringify({
        email,
        password
      }),
      method: "POST"
    });

    assert.equal(loginResponse.status, 200);
    assert.equal(loginResponse.payload.ok, true);

    const blockedLocationsResponse = await requestJson(`${context.url}/locations/live`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    assert.equal(blockedLocationsResponse.status, 403);
    assert.equal(blockedLocationsResponse.payload.code, "PLAN_REQUIRED");

    const checkoutResponse = await requestJson(`${context.url}/commercial/checkout`, {
      body: JSON.stringify({
        companyName,
        contactName: "Smoke Ops",
        email,
        phone: "+52 55 0000 2222",
        planId: "starter-2",
        paymentMethod: "transfer",
        requestTrial: true,
        selectedAddOns: ["radio_dispatch"],
        notes: "Smoke test"
      }),
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "POST"
    });

    assert.equal(checkoutResponse.status, 201);
    assert.equal(checkoutResponse.payload.ok, true);
    assert.ok(checkoutResponse.payload.data.referenceCode);
    assert.equal(checkoutResponse.payload.data.radioFeatureEnabled, true);
    assert.ok(Array.isArray(checkoutResponse.payload.data.downloads));

    const visualCheckoutResponse = await requestJson(`${context.url}/commercial/checkout`, {
      body: JSON.stringify({
        companyName,
        contactName: "Smoke Ops",
        email,
        phone: "+52 55 0000 2222",
        planId: "value-4",
        paymentMethod: "card",
        requestTrial: false
      }),
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "POST"
    });

    assert.equal(visualCheckoutResponse.status, 201);
    const visualConfirmResponse = await requestJson(`${context.url}/commercial/confirm`, {
      body: JSON.stringify({
        externalReference:
          visualCheckoutResponse.payload.data.paymentExternalReference ||
          visualCheckoutResponse.payload.data.id,
        paymentId: `visual-checkout-${stamp}`,
        paymentMethod: "card",
        visualSimulation: true
      }),
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "POST"
    });

    assert.equal(visualConfirmResponse.status, 200);
    assert.equal(visualConfirmResponse.payload.data.paymentStatus, "paid");
    assert.equal(visualConfirmResponse.payload.data.activationStatus, "active");

    const subscriptionResponse = await requestJson(`${context.url}/account/subscription`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    assert.equal(subscriptionResponse.status, 200);
    assert.equal(subscriptionResponse.payload.data.planId, "value-4");
    assert.equal(subscriptionResponse.payload.data.status, "active");
    assert.equal(subscriptionResponse.payload.data.monthlyPrice, 209);

    const liveLocationsResponse = await requestJson(`${context.url}/locations/live`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    assert.equal(liveLocationsResponse.status, 200);
    assert.equal(liveLocationsResponse.payload.ok, true);
    assert.ok(Array.isArray(liveLocationsResponse.payload.data.vehicles));

    const teamUserResponse = await requestJson(`${context.url}/users`, {
      body: JSON.stringify({
        name: "Smoke Supervisor",
        email: `smoke-supervisor-${stamp}@combis.app`,
        password,
        phone: "+52 55 0000 3333",
        role: "admin",
        userStatus: "active"
      }),
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "POST"
    });

    assert.equal(teamUserResponse.status, 201);
    createdTeamUserId = teamUserResponse.payload.data.id;

    const generalConversationResponse = await requestJson(
      `${context.url}/chat/conversations/general`,
      {
        body: JSON.stringify({
          channelMode: "chat"
        }),
        headers: {
          Authorization: `Bearer ${token}`
        },
        method: "POST"
      }
    );

    assert.equal(generalConversationResponse.status, 200);
    assert.equal(generalConversationResponse.payload.ok, true);
    assert.equal(generalConversationResponse.payload.data.channelMode, "chat");

    const directConversationResponse = await requestJson(
      `${context.url}/chat/conversations/direct`,
      {
        body: JSON.stringify({
          targetUserId: createdTeamUserId,
          channelMode: "chat"
        }),
        headers: {
          Authorization: `Bearer ${token}`
        },
        method: "POST"
      }
    );

    assert.equal(directConversationResponse.status, 201);
    assert.equal(directConversationResponse.payload.ok, true);
    assert.equal(directConversationResponse.payload.data.kind, "direct");

    const directConversationId = directConversationResponse.payload.data.id;
    const messageResponse = await requestJson(
      `${context.url}/chat/conversations/${directConversationId}/messages`,
      {
        body: JSON.stringify({
          text: "Mensaje smoke para chat directo"
        }),
        headers: {
          Authorization: `Bearer ${token}`
        },
        method: "POST"
      }
    );

    assert.equal(messageResponse.status, 201);
    assert.equal(messageResponse.payload.ok, true);
    assert.equal(messageResponse.payload.data.conversationId, directConversationId);

    const myOrdersResponse = await requestJson(`${context.url}/commercial/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    assert.equal(myOrdersResponse.status, 200);
    assert.equal(myOrdersResponse.payload.ok, true);
    assert.ok(Array.isArray(myOrdersResponse.payload.data));
    assert.ok(myOrdersResponse.payload.data.length >= 1);
    const downloadableAsset = myOrdersResponse.payload.data[0]?.downloads?.find(
      (entry) => entry.available && entry.token
    );
    assert.ok(downloadableAsset, "La orden trial debe exponer al menos una descarga");

    const downloadResponse = await fetch(
      `${context.url.replace(/\/api$/, "")}${downloadableAsset.urlPath}`
    );

    assert.equal(downloadResponse.status, 200);
    assert.ok(
      String(downloadResponse.headers.get("content-disposition") || "").includes("attachment")
    );

    const incidentResponse = await requestJson(`${context.url}/incidents`, {
      body: JSON.stringify({
        title: "SOS smoke",
        type: "security",
        description: "Prueba automatizada de incidente critico",
        severity: "critical"
      }),
      headers: {
        Authorization: `Bearer ${token}`
      },
      method: "POST"
    });

    assert.equal(incidentResponse.status, 201);
    assert.equal(incidentResponse.payload.ok, true);
    assert.equal(incidentResponse.payload.data.severity, "critical");

    const logoutResponse = await requestJson(`${context.url}/auth/logout`, {
      body: JSON.stringify({
        refreshToken: loginResponse.payload.refreshToken
      }),
      method: "POST"
    });

    assert.equal(logoutResponse.status, 200);
    assert.equal(logoutResponse.payload.ok, true);

    const rejectedRefreshResponse = await requestJson(`${context.url}/auth/refresh`, {
      body: JSON.stringify({
        refreshToken: loginResponse.payload.refreshToken
      }),
      method: "POST"
    });

    assert.equal(rejectedRefreshResponse.status, 401);
    assert.equal(rejectedRefreshResponse.payload.ok, false);

    console.log(
      "ok - flujo humo login/mapa/chat/checkout/incidentes/logout responde correctamente con el store disponible"
    );
  } finally {
    if (createdTeamUserId) {
      await Promise.resolve(context.store.deleteUser(createdTeamUserId)).catch(() => undefined);
    }

    if (createdUserId) {
      await Promise.resolve(context.store.deleteUser(createdUserId)).catch(() => undefined);
    }

    await context.close();
    await mongoose.disconnect().catch(() => undefined);
  }
}

testCriticalFlows().catch((error) => {
  console.error(error);
  process.exit(1);
});
