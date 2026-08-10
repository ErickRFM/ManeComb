const assert = require("node:assert/strict");
const http = require("node:http");

const createApp = require("../src/app");
const { createEmbeddedStore } = require("../src/data/store");
const { signToken } = require("../src/utils/jwt");

async function main() {
  const store = createEmbeddedStore();
  const admin = await store.createUser({
    name: "RTC Tenant Admin",
    email: `rtc-tenant-admin-${Date.now()}@manecomb.test`,
    password: "Ruta123!",
    role: "admin",
    accountType: "operations",
    organizationId: "manecomb-demo",
    companyId: "manecomb-demo",
    userStatus: "active",
    status: "offline"
  });

  const ownSession = store.createRtcSession({
    roomId: "tenant-room-own",
    organizationId: "manecomb-demo",
    initiatedBy: admin.id,
    participantUserIds: [admin.id],
    participantNames: [admin.name],
    mode: "audio"
  });
  store.createRtcSession({
    roomId: "tenant-room-foreign",
    organizationId: "other-company",
    initiatedBy: "foreign-user",
    participantUserIds: ["foreign-user"],
    participantNames: ["Foreign User"],
    mode: "video"
  });

  const app = createApp({
    store,
    getDbState: () => ({ connected: false, mode: "embedded", message: "rtc-tenant-authority-test" })
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/rtc/sessions?limit=20`, {
      headers: { Authorization: `Bearer ${signToken(admin)}` }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.ok(Array.isArray(payload.data));
    assert.deepEqual(payload.data.map((session) => session.id), [ownSession.id]);
    assert.ok(payload.data.every((session) => session.organizationId === "manecomb-demo"));
    console.log("ok - rtc session tenant authority");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
