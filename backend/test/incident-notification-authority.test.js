const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { getRolesWithPermission } = require("../src/middlewares/access-control");

function main() {
  const roles = getRolesWithPermission("canManageIncidents");
  for (const role of ["owner", "admin", "dispatcher", "supervisor", "support"]) {
    assert.ok(roles.includes(role), `${role} debe recibir autoridad de incidencias`);
  }
  assert.ok(!roles.includes("viewer"));
  assert.ok(!roles.includes("driver"));

  const source = fs.readFileSync(
    path.resolve(__dirname, "../src/modules/incidents/routes.js"),
    "utf8"
  );
  assert.ok(source.includes('const incidentManagerRoles = getRolesWithPermission("canManageIncidents");'));
  assert.ok(source.includes("targetRoles: incidentManagerRoles"));
  assert.ok(!source.includes('targetRoles: ["admin", "supervisor"]'));

  console.log("ok - incident notification authority");
}

main();
