const assert = require("node:assert/strict");
const http = require("node:http");

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");

async function requestJson(baseUrl, method, route, body, token) {
  const response = await fetch(`${baseUrl}/api${route}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, payload: await response.json() };
}

async function login(baseUrl, password) {
  return requestJson(baseUrl, "POST", "/auth/login", {
    email: "admin@combis.app",
    password
  });
}

async function run() {
  const store = createEmbeddedStore();
  const server = http.createServer(createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "test" })
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const firstLogin = await login(baseUrl, "Ruta123!");
    const secondLogin = await login(baseUrl, "Ruta123!");
    assert.equal(firstLogin.status, 200);
    assert.equal(secondLogin.status, 200);

    const mismatch = await requestJson(
      baseUrl,
      "POST",
      "/users/me/change-password",
      {
        currentPassword: "Ruta123!",
        newPassword: "NuevaRuta456!",
        confirmPassword: "OtraRuta456!"
      },
      firstLogin.payload.token
    );
    assert.equal(mismatch.status, 400);

    const weak = await requestJson(
      baseUrl,
      "POST",
      "/users/me/change-password",
      {
        currentPassword: "Ruta123!",
        newPassword: "debil",
        confirmPassword: "debil"
      },
      firstLogin.payload.token
    );
    assert.equal(weak.status, 400);

    const invalidCurrent = await requestJson(
      baseUrl,
      "POST",
      "/users/me/change-password",
      {
        currentPassword: "Incorrecta123!",
        newPassword: "NuevaRuta456!",
        confirmPassword: "NuevaRuta456!"
      },
      firstLogin.payload.token
    );
    assert.equal(invalidCurrent.status, 401);

    const changed = await requestJson(
      baseUrl,
      "POST",
      "/users/me/change-password",
      {
        currentPassword: "Ruta123!",
        newPassword: "NuevaRuta456!",
        confirmPassword: "NuevaRuta456!"
      },
      firstLogin.payload.token
    );
    assert.equal(changed.status, 200);
    assert.equal(changed.payload.ok, true);
    assert.equal(changed.payload.data.revokedSessions, 1);

    const currentSessionStillActive = await requestJson(
      baseUrl,
      "GET",
      "/account/sessions",
      undefined,
      firstLogin.payload.token
    );
    assert.equal(currentSessionStillActive.status, 200);

    const otherSessionRevoked = await requestJson(
      baseUrl,
      "GET",
      "/account/sessions",
      undefined,
      secondLogin.payload.token
    );
    assert.equal(otherSessionRevoked.status, 401);

    const oldPasswordLogin = await login(baseUrl, "Ruta123!");
    assert.equal(oldPasswordLogin.status, 401);

    const newPasswordLogin = await login(baseUrl, "NuevaRuta456!");
    assert.equal(newPasswordLogin.status, 200);

    const revokeOthers = await requestJson(
      baseUrl,
      "DELETE",
      "/users/me/sessions/others",
      undefined,
      newPasswordLogin.payload.token
    );
    assert.equal(revokeOthers.status, 200);
    assert.equal(revokeOthers.payload.ok, true);

    // Regression: refresh rota el refresh token dentro del mismo sid. Logout
    // debe poder revocar ESE sid usando el bearer firmado aunque el cliente aun
    // mande el refresh token anterior, sin tumbar otra sesion del usuario.
    const raceLogin = await login(baseUrl, "NuevaRuta456!");
    assert.equal(raceLogin.status, 200);

    const racePushToken = "fcm-account-security-race-token";
    const pushRegistered = await requestJson(
      baseUrl,
      "POST",
      "/notifications/push-subscriptions",
      {
        token: racePushToken,
        platform: "android",
        deviceName: "account-security-test"
      },
      raceLogin.payload.token
    );
    assert.equal(pushRegistered.status, 201);

    const rotated = await requestJson(
      baseUrl,
      "POST",
      "/auth/refresh",
      { refreshToken: raceLogin.payload.refreshToken }
    );
    assert.equal(rotated.status, 200);
    assert.notEqual(rotated.payload.refreshToken, raceLogin.payload.refreshToken);

    const exactLogout = await requestJson(
      baseUrl,
      "POST",
      "/auth/logout",
      {
        // Deliberadamente stale: simula la carrera refresh -> logout.
        refreshToken: raceLogin.payload.refreshToken,
        // Simula el fallback server-side si el DELETE push del dispositivo no
        // alcanzo a completarse antes del teardown.
        pushToken: racePushToken
      },
      raceLogin.payload.token
    );
    assert.equal(exactLogout.status, 200);
    assert.equal(exactLogout.payload.ok, true);

    const rotatedSessionRevoked = await requestJson(
      baseUrl,
      "GET",
      "/auth/me",
      undefined,
      rotated.payload.token
    );
    assert.equal(rotatedSessionRevoked.status, 401);

    const independentSessionStillActive = await requestJson(
      baseUrl,
      "GET",
      "/auth/me",
      undefined,
      newPasswordLogin.payload.token
    );
    assert.equal(independentSessionStillActive.status, 200);

    const raceUser = await store.getUserById(raceLogin.payload.user.id);
    assert.equal(
      (raceUser.pushSubscriptions || []).some((entry) => entry.token === racePushToken),
      false
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run()
  .then(() => console.log("account-security.test.js: OK"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
