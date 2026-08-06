process.env.MONGO_URI = "";
process.env.MONGODB_URI = "";
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });

const assert = require("node:assert/strict");
const {
  canAssignPlatformRole,
  assertCanAssignPlatformRole
} = require("../src/modules/platform/governance-policy");

function main() {
  for (const role of [
    "platform_owner",
    "platform_admin",
    "platform_support",
    "platform_finance",
    "platform_viewer"
  ]) {
    assert.equal(
      canAssignPlatformRole("platform_owner", role),
      true,
      `platform_owner debe poder asignar ${role}`
    );
  }

  assert.equal(canAssignPlatformRole("platform_admin", "platform_owner"), false);
  assert.equal(canAssignPlatformRole("platform_admin", "platform_admin"), true);
  assert.equal(canAssignPlatformRole("platform_admin", "platform_support"), true);
  assert.equal(canAssignPlatformRole("platform_admin", "platform_finance"), true);
  assert.equal(canAssignPlatformRole("platform_admin", "platform_viewer"), true);

  for (const actorRole of ["platform_support", "platform_finance", "platform_viewer", "unknown"]) {
    assert.equal(canAssignPlatformRole(actorRole, "platform_viewer"), false);
  }

  assert.throws(
    () => assertCanAssignPlatformRole("platform_admin", "platform_owner"),
    /privilegios superiores/
  );
  assert.throws(
    () => assertCanAssignPlatformRole("platform_owner", "not-a-role"),
    /Rol Platform no válido/
  );
  assert.equal(assertCanAssignPlatformRole("platform_admin", "platform_finance"), "platform_finance");

  console.log("PASS: internal Platform role assignment hierarchy is fail-closed");
}

try {
  main();
} catch (error) {
  console.error("TEST SUITE FAILED:", error.message);
  process.exit(1);
}
