process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";
process.env.PLATFORM_MFA_ENCRYPTION_KEY = "MinzFLmGlxqwGor12GdyXqZYsRea/r+QAWuVhEvPMRg=";
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });

const assert = require("node:assert/strict");
const http = require("http");
const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { signPlatformToken } = require("../src/utils/platform-jwt");
const {
  createPlatformSession,
  getPlatformSessionById,
  markPlatformSessionMfaVerified
} = require("../src/services/platform-sessions");
const {
  listGovernanceUsers,
  createGovernanceUser,
  listGovernanceSessions,
  validateActionRequest,
  executeGovernanceAction
} = require("../src/modules/platform/governance-service");

const PASSWORD = "PlatformTest@123";

function requestJson(server, { path, token, method = "GET", body, headers = {} }) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const serialized = body === undefined ? "" : JSON.stringify(body);
    const request = http.request({
      hostname: "127.0.0.1",
      port: address.port,
      path,
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(serialized ? { "content-type": "application/json", "content-length": Buffer.byteLength(serialized) } : {}),
        ...headers
      }
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        try {
          resolve({ status: response.statusCode, body: raw ? JSON.parse(raw) : null });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    if (serialized) request.write(serialized);
    request.end();
  });
}

async function main() {
  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total += 1;
    try {
      await fn();
      passed += 1;
      console.log("PASS:", name);
    } catch (error) {
      console.error("FAIL:", name, "-", error.message);
      process.exit(1);
    }
  }

  const store = createEmbeddedStore();
  const owner = store.createPlatformUser({
    name: "Platform Owner",
    email: "governance-owner@manecomb.com",
    password: PASSWORD,
    role: "platform_owner"
  });
  const admin = store.createPlatformUser({
    name: "Platform Admin",
    email: "governance-admin@manecomb.com",
    password: PASSWORD,
    role: "platform_admin"
  });
  const support = store.createPlatformUser({
    name: "Platform Support",
    email: "governance-support@manecomb.com",
    password: PASSWORD,
    role: "platform_support"
  });

  const platformEmails = [owner.email, admin.email, support.email];
  store.listPlatformUsers = () => platformEmails
    .map((email) => store.getPlatformUserByEmail(email))
    .filter(Boolean);

  const context = {
    app: { locals: { store } },
    headers: { "user-agent": "governance-test-browser" },
    ip: "127.0.0.1"
  };
  const ownerSession = await createPlatformSession(owner.id, context);
  const adminSession = await createPlatformSession(admin.id, context);
  const supportSession = await createPlatformSession(support.id, context);
  await markPlatformSessionMfaVerified(ownerSession.session.id);
  await markPlatformSessionMfaVerified(adminSession.session.id);
  await markPlatformSessionMfaVerified(supportSession.session.id);

  const ownerActor = { id: owner.id, role: owner.role };

  await test("team list is paginated and secret-free", async () => {
    const result = await listGovernanceUsers(store, { page: "1", limit: "2", sort: "name", order: "asc" });
    assert.equal(result.pagination.total, 3);
    assert.equal(result.items.length, 2);
    const text = JSON.stringify(result);
    assert.equal(text.includes("passwordHash"), false);
    assert.equal(text.includes("mfaSecretEncrypted"), false);
    assert.equal(text.includes("mfaBackupCodes"), false);
  });

  await test("internal user creation requires a strong temporary password and MFA enrollment", async () => {
    await assert.rejects(
      () => createGovernanceUser(store, owner.id, {
        name: "Finance Weak",
        email: "finance-weak@manecomb.com",
        password: "short",
        role: "platform_finance"
      }),
      /al menos 12 caracteres/
    );

    const created = await createGovernanceUser(store, owner.id, {
      name: "Platform Finance",
      email: "governance-finance@manecomb.com",
      password: "Temporary@12345",
      role: "platform_finance"
    });
    platformEmails.push(created.email);
    assert.equal(created.role, "platform_finance");
    assert.equal(created.mfaEnrollmentRequired, true);
    assert.equal(JSON.stringify(created).includes("Temporary@12345"), false);
    assert.equal(JSON.stringify(created).includes("passwordHash"), false);
  });

  await test("session listing excludes IP, user-agent and refresh hashes", async () => {
    const result = await listGovernanceSessions(store, { page: "1", limit: "20" }, ownerSession.session.id);
    assert.ok(result.items.length >= 3);
    assert.ok(result.items.some((session) => session.current));
    const text = JSON.stringify(result);
    assert.equal(text.includes("127.0.0.1"), false);
    assert.equal(text.includes("governance-test-browser"), false);
    assert.equal(text.includes("refreshTokenHash"), false);
  });

  await test("controlled actions require reason, confirmation and idempotency", async () => {
    assert.throws(
      () => validateActionRequest(owner.id, "short", {
        action: "platform.user.suspend",
        targetId: support.id,
        reason: "razón suficientemente larga",
        confirmation: "CONFIRM platform.user.suspend"
      }),
      /Idempotency-Key/
    );
    assert.throws(
      () => validateActionRequest(owner.id, "governance-key-validation-01", {
        action: "platform.user.suspend",
        targetId: support.id,
        reason: "razón suficientemente larga",
        confirmation: "YES"
      }),
      /La confirmación debe ser/
    );
  });

  const suspendPayload = {
    action: "platform.user.suspend",
    targetId: support.id,
    reason: "Suspensión controlada para validar el gobierno interno",
    confirmation: "CONFIRM platform.user.suspend"
  };

  await test("suspending a user revokes sessions and supports safe replay", async () => {
    const first = await executeGovernanceAction(
      store,
      ownerActor,
      "governance-suspend-support-0001",
      suspendPayload,
      ownerSession.session.id
    );
    assert.equal(first.replayed, false);
    assert.equal(first.target.status, "suspended");
    assert.ok(first.revokedCount >= 1);
    const revoked = await getPlatformSessionById(supportSession.session.id);
    assert.equal(revoked.isActive, false);

    const replay = await executeGovernanceAction(
      store,
      ownerActor,
      "governance-suspend-support-0001",
      suspendPayload,
      ownerSession.session.id
    );
    assert.equal(replay.replayed, true);
    assert.equal(replay.id, first.id);
  });

  await test("same idempotency key with another payload is rejected", async () => {
    await assert.rejects(
      () => executeGovernanceAction(
        store,
        ownerActor,
        "governance-suspend-support-0001",
        {
          ...suspendPayload,
          action: "platform.user.reactivate",
          confirmation: "CONFIRM platform.user.reactivate"
        },
        ownerSession.session.id
      ),
      /clave de idempotencia ya fue usada/
    );
  });

  await test("reactivation clears suspension without returning secrets", async () => {
    const result = await executeGovernanceAction(
      store,
      ownerActor,
      "governance-reactivate-support-01",
      {
        action: "platform.user.reactivate",
        targetId: support.id,
        reason: "Reactivación controlada después de validar la suspensión",
        confirmation: "CONFIRM platform.user.reactivate"
      },
      ownerSession.session.id
    );
    assert.equal(result.target.status, "active");
    assert.equal(result.target.suspendedReason, "");
    assert.equal(JSON.stringify(result).includes("passwordHash"), false);
  });

  await test("role change revokes active target sessions", async () => {
    const extraAdminSession = await createPlatformSession(admin.id, context);
    await markPlatformSessionMfaVerified(extraAdminSession.session.id);
    const result = await executeGovernanceAction(
      store,
      ownerActor,
      "governance-role-change-admin-01",
      {
        action: "platform.user.role.change",
        targetId: admin.id,
        nextRole: "platform_support",
        reason: "Ajuste controlado de privilegios para validar revocación",
        confirmation: "CONFIRM platform.user.role.change"
      },
      ownerSession.session.id
    );
    assert.equal(result.target.role, "platform_support");
    assert.ok(result.revokedCount >= 1);
    const revoked = await getPlatformSessionById(extraAdminSession.session.id);
    assert.equal(revoked.isActive, false);
  });

  await test("current session and last owner protections are enforced", async () => {
    await assert.rejects(
      () => executeGovernanceAction(
        store,
        ownerActor,
        "governance-current-session-01",
        {
          action: "platform.session.revoke",
          targetId: ownerSession.session.id,
          reason: "Intento controlado de revocar la propia sesión actual",
          confirmation: "CONFIRM platform.session.revoke"
        },
        ownerSession.session.id
      ),
      /Usa cerrar sesión/
    );

    await assert.rejects(
      () => executeGovernanceAction(
        store,
        { id: "external-owner-actor", role: "platform_owner" },
        "governance-last-owner-guard-01",
        {
          action: "platform.user.suspend",
          targetId: owner.id,
          reason: "Intento controlado de remover al último owner activo",
          confirmation: "CONFIRM platform.user.suspend"
        },
        "external-session"
      ),
      /último platform_owner activo/
    );
  });

  const ownerToken = signPlatformToken({ _id: owner.id, role: owner.role }, ownerSession.session.id);
  const adminForHttp = store.createPlatformUser({
    name: "HTTP Platform Admin",
    email: "governance-http-admin@manecomb.com",
    password: PASSWORD,
    role: "platform_admin"
  });
  platformEmails.push(adminForHttp.email);
  const httpAdminSession = await createPlatformSession(adminForHttp.id, context);
  await markPlatformSessionMfaVerified(httpAdminSession.session.id);
  const adminToken = signPlatformToken({ _id: adminForHttp.id, role: adminForHttp.role }, httpAdminSession.session.id);

  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "test" })
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    await test("team and sessions routes require Platform authentication", async () => {
      assert.equal((await requestJson(server, { path: "/api/platform/team" })).status, 401);
      assert.equal((await requestJson(server, { path: "/api/platform/sessions" })).status, 401);
    });

    await test("platform admin may read and create non-owner team members", async () => {
      const listResponse = await requestJson(server, { path: "/api/platform/team?limit=20", token: adminToken });
      assert.equal(listResponse.status, 200);
      assert.ok(Array.isArray(listResponse.body.data));

      const createResponse = await requestJson(server, {
        path: "/api/platform/team",
        token: adminToken,
        method: "POST",
        body: {
          name: "HTTP Viewer",
          email: "governance-http-viewer@manecomb.com",
          password: "Temporary@67890",
          role: "platform_viewer"
        }
      });
      assert.equal(createResponse.status, 201);
      assert.equal(createResponse.body.data.role, "platform_viewer");
      assert.equal(JSON.stringify(createResponse.body).includes("Temporary@67890"), false);
      assert.equal(JSON.stringify(createResponse.body).includes("passwordHash"), false);
    });

    await test("platform admin cannot create owners or execute controlled actions", async () => {
      const ownerCreate = await requestJson(server, {
        path: "/api/platform/team",
        token: adminToken,
        method: "POST",
        body: {
          name: "Forbidden Owner",
          email: "forbidden-owner@manecomb.com",
          password: "Temporary@99999",
          role: "platform_owner"
        }
      });
      assert.equal(ownerCreate.status, 403);

      const action = await requestJson(server, {
        path: "/api/platform/actions",
        token: adminToken,
        method: "POST",
        headers: { "idempotency-key": "governance-http-admin-action-01" },
        body: {
          action: "platform.sessions.revoke_all",
          targetId: support.id,
          reason: "Intento administrativo sin permiso de acciones owner",
          confirmation: "CONFIRM platform.sessions.revoke_all"
        }
      });
      assert.equal(action.status, 403);
    });

    await test("owner action route validates confirmation and replays safely", async () => {
      const invalid = await requestJson(server, {
        path: "/api/platform/actions",
        token: ownerToken,
        method: "POST",
        headers: { "idempotency-key": "governance-http-owner-invalid-01" },
        body: {
          action: "platform.sessions.revoke_all",
          targetId: support.id,
          reason: "Revocación controlada de sesiones del usuario objetivo",
          confirmation: "CONFIRM wrong"
        }
      });
      assert.equal(invalid.status, 400);

      const payload = {
        action: "platform.sessions.revoke_all",
        targetId: support.id,
        reason: "Revocación controlada de sesiones del usuario objetivo",
        confirmation: "CONFIRM platform.sessions.revoke_all"
      };
      const first = await requestJson(server, {
        path: "/api/platform/actions",
        token: ownerToken,
        method: "POST",
        headers: { "idempotency-key": "governance-http-owner-action-0001" },
        body: payload
      });
      assert.equal(first.status, 200);
      assert.equal(first.body.data.replayed, false);

      const replay = await requestJson(server, {
        path: "/api/platform/actions",
        token: ownerToken,
        method: "POST",
        headers: { "idempotency-key": "governance-http-owner-action-0001" },
        body: payload
      });
      assert.equal(replay.status, 200);
      assert.equal(replay.body.data.replayed, true);
      assert.equal(replay.body.data.id, first.body.data.id);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`\nAll ${passed}/${total} platform-governance tests passed`);
}

main().catch((error) => {
  console.error("TEST SUITE FAILED:", error.message);
  process.exit(1);
});
