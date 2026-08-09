const assert = require("node:assert/strict");
const {
  COMPANY_PROFILE_FIELDS,
  PERSONAL_PROFILE_FIELDS,
  canManageOwnCompanyProfile,
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

function testCompanyAdministratorKeepsCommercialSelfService() {
  for (const role of ["owner", "admin"]) {
    const payload = pickSelfProfileFields(
      { accountType: "company_owner", role },
      {
        name: "Company Admin",
        companyProfile: { companyName: "ManeComb Demo" },
        paymentProfile: { preferredMethod: "spei" },
        operationalSchedule: { enabled: true },
        role: "driver"
      }
    );

    assert.equal(payload.name, "Company Admin");
    assert.deepEqual(payload.companyProfile, { companyName: "ManeComb Demo" });
    assert.deepEqual(payload.paymentProfile, { preferredMethod: "spei" });
    assert.deepEqual(payload.operationalSchedule, { enabled: true });
    assert.equal(payload.role, undefined);
    assert.equal(canManageOwnCompanyProfile({ accountType: "company_owner", role }), true);
  }
}

function testLimitedPortalRolesRemainPersonalOnly() {
  for (const role of ["billing_manager", "support", "viewer"]) {
    const user = { accountType: "company_owner", role };
    const payload = pickSelfProfileFields(user, {
      name: `${role} Updated`,
      phone: "+52 55 9999 0000",
      companyName: "Injected company",
      billingEmail: "injected@manecomb.test",
      companyProfile: { companyName: "Injected Company" },
      paymentProfile: { preferredMethod: "card" },
      operationalSchedule: { enabled: false }
    });

    assert.deepEqual(Object.keys(payload).sort(), ["name", "phone"].sort());
    assert.equal(payload.companyName, undefined);
    assert.equal(payload.billingEmail, undefined);
    assert.equal(payload.companyProfile, undefined);
    assert.equal(payload.paymentProfile, undefined);
    assert.equal(payload.operationalSchedule, undefined);
    assert.equal(canManageOwnCompanyProfile(user), false);
    assert.deepEqual(getSelfProfileFields(user), PERSONAL_PROFILE_FIELDS);
  }
}

function testOperationalAdminDoesNotBecomeCompanyEditor() {
  const user = { accountType: "operations", role: "admin" };
  assert.equal(canManageOwnCompanyProfile(user), false);
  assert.deepEqual(getSelfProfileFields(user), PERSONAL_PROFILE_FIELDS);
}

function testFieldCatalogsRemainExplicit() {
  assert.ok(PERSONAL_PROFILE_FIELDS.includes("avatarUrl"));
  assert.ok(!PERSONAL_PROFILE_FIELDS.includes("companyProfile"));
  assert.ok(COMPANY_PROFILE_FIELDS.includes("companyProfile"));
  assert.deepEqual(getSelfProfileFields({ accountType: "operations", role: "driver" }), PERSONAL_PROFILE_FIELDS);
  assert.deepEqual(getSelfProfileFields({ accountType: "company_owner", role: "owner" }), COMPANY_PROFILE_FIELDS);
  assert.deepEqual(getSelfProfileFields({ accountType: "company_owner", role: "viewer" }), PERSONAL_PROFILE_FIELDS);
}

function main() {
  testOperationalSelfServiceIsPersonalOnly();
  testCompanyAdministratorKeepsCommercialSelfService();
  testLimitedPortalRolesRemainPersonalOnly();
  testOperationalAdminDoesNotBecomeCompanyEditor();
  testFieldCatalogsRemainExplicit();
  console.log("ok - profile self-service authority");
}

main();
