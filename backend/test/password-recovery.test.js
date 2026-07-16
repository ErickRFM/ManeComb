const assert = require("node:assert/strict");
const http = require("node:http");
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");

async function requestJson(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: response.status, payload: await response.json() };
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
    assert.equal(typeof store.generatePasswordResetToken, "function");
    assert.equal(typeof store.resetPasswordWithToken, "function");

    const login = await requestJson(baseUrl, "/auth/login", {
      email: "admin@combis.app",
      password: "Ruta123!"
    });
    assert.equal(login.status, 200);
    assert.ok(login.payload.refreshToken);

    const recovery = await store.generatePasswordResetToken("admin@combis.app");
    assert.ok(recovery?.token);
    const reset = await requestJson(baseUrl, "/auth/reset-password", {
      token: recovery.token,
      password: "NuevaRuta123!"
    });
    assert.equal(reset.status, 200);
    assert.match(reset.payload.message, /mensajes cifrados/i);

    assert.equal(store.authenticate("admin@combis.app", "Ruta123!"), null);
    assert.ok(store.authenticate("admin@combis.app", "NuevaRuta123!"));
    assert.throws(
      () => store.resetPasswordWithToken(recovery.token, "OtraRuta123!"),
      /expirado|invalido/
    );

    const refresh = await requestJson(baseUrl, "/auth/refresh", {
      refreshToken: login.payload.refreshToken
    });
    assert.equal(refresh.status, 401, "el reset debe revocar refresh tokens existentes");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

run()
  .then(() => console.log("ok - password recovery"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
