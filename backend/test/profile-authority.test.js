const assert = require("node:assert/strict");
const {
  COMPANY_PROFILE_FIELDS,
  PERSONAL_PROFILE_FIELDS,
  getSelfProfileFields,
  pickSelfProfileFields
} = require("../src/services/profile-authority");

function testOperationalSelfServiceIsPersonalOnly() {
  const payload = pickSelfProfileFields(
    { accountType: "operations", role: "driver" },
    {
      name: "Conductor Actualizado",
      email: "conductor@example.com",
      phone: "+52 55 1111 2222",
      avatarUrl: "data:image/jpeg;base64,test",
      password: "Ruta123!",
      companyProfile: { companyName: "No permitido" },
      paymentProfile: { preferredMethod: "card" },
      operationalSchedule: { enabled: false },
      role: "admin",
      vehicleId: "vehicle-other"
    }
  );

  assert.deepEqual(Object.keys(payload).sort(), ["avatarUrl", "email", "name", "password", "phone"].sort());
  assert.equal(payload.companyProfile, undefined);
  assert.equal(payload.paymentProfile, undefined);
  assert.equal(payload.operationalSchedule, undefined);
  assert.equal(payload.role, undefined);
  assert.equal(payload.vehicleId, undefined);
}

function testCompanyAccountKeepsCommercialSelfService() {
  const payload = pickSelfProfileFields(
    { accountType: "company_owner", role: "owner" },
    {
      name: "Owner",
      companyProfile: { companyName: "ManeComb Demo" },
      paymentProfile: { preferredMethod: "spei" },
      operationalSchedule: { enabled: true },
      role: "driver"
    }
  );

  assert.equal(payload.name, "Owner");
  assert.deepEqual(payload.companyProfile, { companyName: "ManeComb Demo" });
  assert.deepEqual(payload.paymentProfile, { preferredMethod: "spei" });
  assert.deepEqual(payload.operationalSchedule, { enabled: true });
  assert.equal(payload.role, undefined);
}

function testFieldCatalogsRemainExplicit() {
  assert.ok(PERSONAL_PROFILE_FIELDS.includes("avatarUrl"));
  assert.ok(!PERSONAL_PROFILE_FIELDS.includes("companyProfile"));
  assert.ok(COMPANY_PROFILE_FIELDS.includes("companyProfile"));
  assert.deepEqual(getSelfProfileFields({ accountType: "operations" }), PERSONAL_PROFILE_FIELDS);
  assert.deepEqual(getSelfProfileFields({ accountType: "company_owner" }), COMPANY_PROFILE_FIELDS);
}

function main() {
  testOperationalSelfServiceIsPersonalOnly();
  testCompanyAccountKeepsCommercialSelfService();
  testFieldCatalogsRemainExplicit();
  console.log("ok - profile self-service authority");
}

main();
