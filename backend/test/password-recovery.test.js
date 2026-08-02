const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const bcrypt = require("bcryptjs");
const { createHash } = require("node:crypto");

process.env.PASSWORD_RESET_PUBLIC_URL = "https://manecomb.com/reset-password?source=email";
process.env.TRUST_PROXY = "true";

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { updateMongoPasswordWithResetToken } = require("../src/data/mongo-store");
const communication = require("../modules/communication");

async function requestJson(baseUrl, route, body, clientIp = "203.0.113.10") {
  const response = await fetch(`${baseUrl}/api${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": clientIp
    },
    body: JSON.stringify(body)
  });
  return { status: response.status, payload: await response.json() };
}

function createFakeAtomicUserModel(initialState) {
  const state = { ...initialState };
  let failNextUpdate = false;

  return {
    state,
    failNextUpdate() {
      failNextUpdate = true;
    },
    findOneAndUpdate(filter, update) {
      return {
        lean: async () => {
          if (failNextUpdate) {
            failNextUpdate = false;
            throw new Error("simulated mongo write failure");
          }

          const matches = state.resetTokenHash === filter.resetTokenHash
            && new Date(state.resetTokenExpiresAt).getTime() > filter.resetTokenExpiresAt.$gt.getTime();
          if (!matches) return null;

          Object.assign(state, update.$set);
          Object.entries(update.$inc || {}).forEach(([key, value]) => {
            state[key] = Number(state[key] || 0) + Number(value);
          });
          Object.keys(update.$unset || {}).forEach((key) => delete state[key]);
          return { ...state };
        }
      };
    }
  };
}

async function run() {
  const authSource = fs.readFileSync(path.resolve(__dirname, "../src/modules/auth/routes.js"), "utf8");
  assert.ok(!authSource.includes("api.resend.com"));
  assert.ok(!authSource.includes("Authorization: `Bearer ${RESEND_API_KEY}`"));
  assert.ok(authSource.includes('template: "password-reset"'));
  assert.ok(authSource.includes("new URL(PASSWORD_RESET_PUBLIC_URL)"));

  const store = createEmbeddedStore();
  const appEvents = [];
  store.recordAppEvent = async (event) => {
    appEvents.push(event);
    return event;
  };

  const originalSendEmail = communication.sendEmail;
  const originalConsoleError = console.error;
  const capturedErrors = [];
  let deliveryStatus = "dry_run";
  let providerDelayMs = 0;
  let providerThrows = false;
  let sendEmailCalls = 0;
  const sentInputs = [];

  communication.sendEmail = async (input) => {
    sendEmailCalls += 1;
    sentInputs.push(input);
    if (providerDelayMs) await new Promise((resolve) => setTimeout(resolve, providerDelayMs));
    if (providerThrows) throw new Error("provider unavailable for test");
    return communication.deliveryResults.createDeliveryResult({
      status: deliveryStatus,
      deliveryId: `delivery-${sendEmailCalls}`,
      error: deliveryStatus === "failed" ? "provider_unavailable" : undefined
    });
  };
  console.error = (...args) => capturedErrors.push(args.map(String).join(" "));

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
    }, "203.0.113.1");
    assert.equal(login.status, 200);
    assert.ok(login.payload.refreshToken);

    const originalGeneratePasswordResetToken = store.generatePasswordResetToken;
    store.generatePasswordResetToken = async (email) => {
      const generated = await originalGeneratePasswordResetToken(email);
      return generated ? { ...generated, token: "token con +/? y espacios" } : null;
    };

    const forgotDryRun = await requestJson(baseUrl, "/auth/forgot-password", {
      email: "admin@combis.app"
    }, "203.0.113.11");
    deliveryStatus = "queued";
    const forgotQueued = await requestJson(baseUrl, "/auth/forgot-password", {
      email: "admin@combis.app"
    }, "203.0.113.12");
    deliveryStatus = "sent";
    providerDelayMs = 25;
    const forgotSent = await requestJson(baseUrl, "/auth/forgot-password", {
      email: "admin@combis.app"
    }, "203.0.113.13");
    providerDelayMs = 0;
    deliveryStatus = "skipped";
    const forgotSkipped = await requestJson(baseUrl, "/auth/forgot-password", {
      email: "admin@combis.app"
    }, "203.0.113.14");
    deliveryStatus = "failed";
    const forgotFailed = await requestJson(baseUrl, "/auth/forgot-password", {
      email: "admin@combis.app"
    }, "203.0.113.15");
    providerThrows = true;
    const forgotProviderError = await requestJson(baseUrl, "/auth/forgot-password", {
      email: "admin@combis.app"
    }, "203.0.113.16");
    providerThrows = false;
    const forgotMissing = await requestJson(baseUrl, "/auth/forgot-password", {
      email: "missing-user@combis.app"
    }, "203.0.113.17");

    for (const response of [forgotDryRun, forgotQueued, forgotSent, forgotSkipped, forgotFailed, forgotProviderError, forgotMissing]) {
      assert.equal(response.status, 200);
      assert.equal(response.payload.message, forgotDryRun.payload.message);
      assert.deepEqual(Object.keys(response.payload).sort(), ["message", "ok"]);
    }
    assert.equal(sendEmailCalls, 6, "el usuario inexistente no debe disparar correo");

    const resetLink = new URL(sentInputs[0].data.resetUrl);
    assert.equal(resetLink.origin, "https://manecomb.com");
    assert.equal(resetLink.pathname, "/reset-password");
    assert.equal(resetLink.searchParams.get("source"), "email");
    assert.equal(resetLink.searchParams.get("token"), "token con +/? y espacios");

    const failedEvents = appEvents.filter((event) => event.type === "password_reset_delivery_failed");
    assert.equal(failedEvents.length, 2);
    assert.ok(appEvents.some((event) => event.type === "password_reset_requested"));
    assert.ok(appEvents.some((event) => event.type === "password_reset_delivery_requested"));
    const serializedErrors = capturedErrors.join("\n");
    assert.ok(!serializedErrors.includes("admin@combis.app"));
    assert.ok(!serializedErrors.includes("token="));

    for (let index = 0; index < 5; index += 1) {
      const allowed = await requestJson(baseUrl, "/auth/forgot-password", {
        email: "missing-user@combis.app"
      }, "203.0.113.99");
      assert.equal(allowed.status, 200);
    }
    const rateLimited = await requestJson(baseUrl, "/auth/forgot-password", {
      email: "missing-user@combis.app"
    }, "203.0.113.99");
    assert.equal(rateLimited.status, 429);

    store.generatePasswordResetToken = originalGeneratePasswordResetToken;

    const weakRecovery = await store.generatePasswordResetToken("admin@combis.app");
    const weakReset = await requestJson(baseUrl, "/auth/reset-password", {
      token: weakRecovery.token,
      password: "sololetras"
    }, "203.0.113.21");
    assert.equal(weakReset.status, 400);
    assert.match(weakReset.payload.message, /letras|numeros|caracter especial/i);

    const expiredRecovery = await store.generatePasswordResetToken("admin@combis.app");
    const originalDateNow = Date.now;
    Date.now = () => originalDateNow() + (2 * 60 * 60 * 1000);
    assert.throws(
      () => store.resetPasswordWithToken(expiredRecovery.token, "Expirada123!"),
      /expirado|invalido/
    );
    Date.now = originalDateNow;

    const recovery = await store.generatePasswordResetToken("admin@combis.app");
    const callsBeforePasswordChanged = sendEmailCalls;
    const reset = await requestJson(baseUrl, "/auth/reset-password", {
      token: recovery.token,
      password: "NuevaRuta123!"
    }, "203.0.113.22");
    assert.equal(reset.status, 200);
    assert.match(reset.payload.message, /mensajes cifrados/i);
    assert.equal(sendEmailCalls, callsBeforePasswordChanged + 1);
    const passwordChanged = sentInputs.at(-1);
    assert.equal(passwordChanged.eventType, "PASSWORD_CHANGED");
    assert.equal(passwordChanged.template, "password-changed");
    assert.match(passwordChanged.idempotencyKey, /^password-changed:user-admin-01:\d+$/);
    assert.ok(!passwordChanged.idempotencyKey.includes(recovery.token));
    assert.ok(appEvents.some((event) => event.type === "password_reset_completed"));

    assert.equal(store.authenticate("admin@combis.app", "Ruta123!"), null);
    assert.ok(store.authenticate("admin@combis.app", "NuevaRuta123!"));
    assert.throws(
      () => store.resetPasswordWithToken(recovery.token, "OtraRuta123!"),
      /expirado|invalido/
    );

    const refresh = await requestJson(baseUrl, "/auth/refresh", {
      refreshToken: login.payload.refreshToken
    }, "203.0.113.23");
    assert.equal(refresh.status, 401, "el reset debe revocar refresh tokens existentes");

    const concurrentRecovery = await store.generatePasswordResetToken("admin@combis.app");
    const concurrentResults = await Promise.allSettled([
      Promise.resolve().then(() => store.resetPasswordWithToken(concurrentRecovery.token, "ConcurrenteA1!")),
      Promise.resolve().then(() => store.resetPasswordWithToken(concurrentRecovery.token, "ConcurrenteB2!"))
    ]);
    assert.equal(concurrentResults.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(concurrentResults.filter((result) => result.status === "rejected").length, 1);
    const authenticatesWithA = Boolean(store.authenticate("admin@combis.app", "ConcurrenteA1!"));
    const authenticatesWithB = Boolean(store.authenticate("admin@combis.app", "ConcurrenteB2!"));
    assert.notEqual(authenticatesWithA, authenticatesWithB, "solo una contrasena concurrente debe quedar activa");
    assert.throws(
      () => store.resetPasswordWithToken(concurrentRecovery.token, "ConcurrenteC3!"),
      /expirado|invalido/
    );

    const retryableRecovery = await store.generatePasswordResetToken("admin@combis.app");
    const originalHashSync = bcrypt.hashSync;
    try {
      bcrypt.hashSync = () => {
        throw new Error("simulated password hash failure");
      };
      assert.throws(
        () => store.resetPasswordWithToken(retryableRecovery.token, "TrasFallo123!"),
        /simulated password hash failure/
      );
    } finally {
      bcrypt.hashSync = originalHashSync;
    }
    assert.ok(
      store.resetPasswordWithToken(retryableRecovery.token, "TrasFallo123!"),
      "el token embedded debe seguir utilizable tras un fallo previo a la mutacion"
    );
    assert.ok(store.authenticate("admin@combis.app", "TrasFallo123!"));

    const mongoTokenHash = createHash("sha256").update("mongo-concurrent-token").digest("hex");
    const fakeMongoModel = createFakeAtomicUserModel({
      _id: "mongo-user",
      credentialVersion: 2,
      passwordHash: "previous-hash",
      resetTokenHash: mongoTokenHash,
      resetTokenExpiresAt: new Date(Date.now() + 60_000)
    });
    const mongoResults = await Promise.all([
      updateMongoPasswordWithResetToken({
        userModel: fakeMongoModel,
        tokenHash: mongoTokenHash,
        passwordHash: "mongo-hash-a"
      }),
      updateMongoPasswordWithResetToken({
        userModel: fakeMongoModel,
        tokenHash: mongoTokenHash,
        passwordHash: "mongo-hash-b"
      })
    ]);
    assert.equal(mongoResults.filter(Boolean).length, 1, "el contrato Mongo debe reclamar el token una sola vez");
    assert.ok(["mongo-hash-a", "mongo-hash-b"].includes(fakeMongoModel.state.passwordHash));
    assert.equal(fakeMongoModel.state.resetTokenHash, undefined);

    const failedMongoTokenHash = createHash("sha256").update("mongo-retry-token").digest("hex");
    const retryableMongoModel = createFakeAtomicUserModel({
      _id: "mongo-retry-user",
      credentialVersion: 1,
      passwordHash: "unchanged-hash",
      resetTokenHash: failedMongoTokenHash,
      resetTokenExpiresAt: new Date(Date.now() + 60_000)
    });
    retryableMongoModel.failNextUpdate();
    await assert.rejects(
      updateMongoPasswordWithResetToken({
        userModel: retryableMongoModel,
        tokenHash: failedMongoTokenHash,
        passwordHash: "failed-write-hash"
      }),
      /simulated mongo write failure/
    );
    assert.equal(retryableMongoModel.state.passwordHash, "unchanged-hash");
    assert.equal(retryableMongoModel.state.resetTokenHash, failedMongoTokenHash);
    const retriedMongoReset = await updateMongoPasswordWithResetToken({
      userModel: retryableMongoModel,
      tokenHash: failedMongoTokenHash,
      passwordHash: "recovered-write-hash"
    });
    assert.ok(retriedMongoReset, "el token Mongo debe seguir utilizable tras fallo de escritura");
    assert.equal(retryableMongoModel.state.passwordHash, "recovered-write-hash");
  } finally {
    communication.sendEmail = originalSendEmail;
    console.error = originalConsoleError;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

run()
  .then(() => console.log("ok - password recovery"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
