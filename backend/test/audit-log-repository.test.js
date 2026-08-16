process.env.NODE_ENV = "test";
process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createEmbeddedStore } = require("../src/data/store");

async function main() {
  const store = createEmbeddedStore();
  const now = new Date();

  await store.createAuditLog({
    _id: "audit-own-org",
    actorId: "actor-a",
    organizationId: "org-a",
    action: "vehicle.updated",
    targetType: "vehicle",
    targetId: "vehicle-a",
    severity: "info",
    createdAt: now
  });
  await store.createAuditLog({
    _id: "audit-same-actor",
    actorId: "actor-a",
    organizationId: "org-b",
    action: "session.revoked",
    targetType: "session",
    targetId: "session-a",
    severity: "warning",
    createdAt: now
  });
  await store.createAuditLog({
    _id: "audit-foreign",
    actorId: "actor-b",
    organizationId: "org-b",
    action: "must-not-leak",
    targetType: "secret",
    targetId: "secret-b",
    severity: "critical",
    createdAt: now
  });

  const visible = await store.listAuditLogsForActor({
    organizationId: "org-a",
    actorId: "actor-a",
    since: new Date(now.getTime() - 1000),
    limit: 50
  });

  assert.deepEqual(
    new Set(visible.map((entry) => entry.id)),
    new Set(["audit-own-org", "audit-same-actor"])
  );
  assert.equal(JSON.stringify(visible).includes("must-not-leak"), false);

  const routeSource = fs.readFileSync(
    path.join(__dirname, "../src/modules/audit-logs/routes.js"),
    "utf8"
  );
  const auditServiceSource = fs.readFileSync(
    path.join(__dirname, "../src/services/audit.js"),
    "utf8"
  );

  for (const source of [routeSource, auditServiceSource]) {
    assert.equal(source.includes("AuditLogModel"), false);
    assert.equal(source.includes("mongoose"), false);
  }
  assert.equal(routeSource.includes("listAuditLogsForActor"), true);
  assert.equal(auditServiceSource.includes("createAuditLog"), true);

  console.log("ok - audit logs use canonical repository authority and preserve tenant scope");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
