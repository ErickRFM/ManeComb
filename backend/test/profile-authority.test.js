const assert = require("node:assert/strict");
const {
  COMPANY_PROFILE_FIELDS,
  PERSONAL_PROFILE_FIELDS,
  canManageOwnCompanyProfile,
  getSelfProfileFields,
  pickSelfProfileFields
} = require("../src/services/profile-authority");
const {
  MAX_PROFILE_AVATAR_BYTES,
  ProfileAvatarError
} = require("../src/services/profile-avatar");
const {
  ManagedUserProfilePolicyError,
  assertManagedUserIdentityStable
} = require("../src/services/managed-user-profile-policy");
const {
  filterProfileDocumentsForViewer,
  sanitizeProfileForViewer
} = require("../src/services/profile-visibility");

function testOperationalSelfServiceIsPersonalOnly() {
  const avatarUrl = "data:image/jpeg;base64,dGVzdA==";
  const payload = pickSelfProfileFields(
    { accountType: "operations", role: "driver" },
    {
      name: "Conductor Actualizado",
      email: "conductor@example.com",
      phone: "+52 55 1111 2222",
      avatarUrl,
      password: "Ruta123!",
      companyProfile: { companyName: "No permitido" },
      paymentProfile: { preferredMethod: "card" },
      operationalSchedule: { enabled: false },
      role: "admin",
      vehicleId: "vehicle-other"
    }
  );

  assert.deepEqual(Object.keys(payload).sort(), ["avatarUrl", "email", "name", "phone"].sort());
  assert.equal(payload.avatarUrl, avatarUrl);
  assert.equal(payload.password, undefined);
  assert.equal(payload.companyProfile, undefined);
  assert.equal(payload.paymentProfile, undefined);
  assert.equal(payload.operationalSchedule, undefined);
  assert.equal(payload.role, undefined);
  assert.equal(payload.vehicleId, undefined);
}

function testAvatarAuthorityRejectsEphemeralAndOversizedValues() {
  const driver = { accountType: "operations", role: "driver" };

  for (const avatarUrl of [
    "file:///data/user/0/com.manecomb/cache/avatar.jpg",
    "content://media/external/images/media/42",
    "blob:https://manecomb.com/avatar"
  ]) {
    assert.throws(
      () => pickSelfProfileFields(driver, { avatarUrl }),
      (error) => error instanceof ProfileAvatarError && error.statusCode === 400
    );
  }

  const oversized = Buffer.alloc(MAX_PROFILE_AVATAR_BYTES + 1, 1).toString("base64");
  assert.throws(
    () => pickSelfProfileFields(driver, { avatarUrl: `data:image/jpeg;base64,${oversized}` }),
    (error) => error instanceof ProfileAvatarError && /pesada/i.test(error.message)
  );

  const normalized = pickSelfProfileFields(driver, {
    avatarUrl: " data:image/png;base64, ZGF0YQ== \n"
  });
  assert.equal(normalized.avatarUrl, "data:image/png;base64,ZGF0YQ==");
  assert.equal(pickSelfProfileFields(driver, { avatarUrl: null }).avatarUrl, null);
}

function testCompanyAdministratorKeepsCommercialSelfServiceWithoutSchedule() {
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
    assert.equal(payload.operationalSchedule, undefined);
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
  assert.ok(!PERSONAL_PROFILE_FIELDS.includes("password"));
  assert.ok(!PERSONAL_PROFILE_FIELDS.includes("companyProfile"));
  assert.ok(COMPANY_PROFILE_FIELDS.includes("companyProfile"));
  assert.ok(!COMPANY_PROFILE_FIELDS.includes("password"));
  assert.ok(!COMPANY_PROFILE_FIELDS.includes("operationalSchedule"));
  assert.deepEqual(getSelfProfileFields({ accountType: "operations", role: "driver" }), PERSONAL_PROFILE_FIELDS);
  assert.deepEqual(getSelfProfileFields({ accountType: "company_owner", role: "owner" }), COMPANY_PROFILE_FIELDS);
  assert.deepEqual(getSelfProfileFields({ accountType: "company_owner", role: "viewer" }), PERSONAL_PROFILE_FIELDS);
}

function testProfileIdentityIsImmutableAfterCreation() {
  const identities = [
    { role: "owner", accountType: "company_owner" },
    { role: "admin", accountType: "company_owner" },
    { role: "admin", accountType: "operations" },
    { role: "dispatcher", accountType: "operations" },
    { role: "supervisor", accountType: "operations" },
    { role: "billing_manager", accountType: "company_owner" },
    { role: "support", accountType: "company_owner" },
    { role: "viewer", accountType: "company_owner" },
    { role: "driver", accountType: "operations" }
  ];

  for (const identity of identities) {
    assert.doesNotThrow(() => assertManagedUserIdentityStable(identity, {}));
    assert.doesNotThrow(() => assertManagedUserIdentityStable(identity, { ...identity }));
    assert.throws(
      () => assertManagedUserIdentityStable(identity, { role: identity.role === "admin" ? "viewer" : "admin" }),
      (error) => error instanceof ManagedUserProfilePolicyError && error.code === "PROFILE_ROLE_IMMUTABLE"
    );
    assert.throws(
      () => assertManagedUserIdentityStable(identity, {
        accountType: identity.accountType === "operations" ? "company_owner" : "operations"
      }),
      (error) => error instanceof ManagedUserProfilePolicyError && error.code === "PROFILE_CHANNEL_IMMUTABLE"
    );
  }

  assert.throws(
    () => assertManagedUserIdentityStable(
      { role: "admin", accountType: "operations" },
      { role: "conductor" }
    ),
    (error) => error.code === "PROFILE_ROLE_IMMUTABLE"
  );
  assert.throws(
    () => assertManagedUserIdentityStable(
      { role: "viewer", accountType: "company_owner" },
      { role: "not-a-role" }
    ),
    (error) => error.code === "PROFILE_ROLE_IMMUTABLE"
  );
}

function testProfileDocumentsRemainTenantScoped() {
  const documents = [
    { id: "doc-own", organizationId: "tenant-a", ownerType: "driver", ownerId: "driver-a" },
    { id: "doc-same-tenant-other-driver", organizationId: "tenant-a", ownerType: "driver", ownerId: "driver-b" },
    { id: "doc-foreign", organizationId: "tenant-b", ownerType: "driver", ownerId: "driver-c" }
  ];

  const adminDocuments = filterProfileDocumentsForViewer(
    { id: "admin-a", role: "admin", accountType: "operations", organizationId: "tenant-a" },
    documents
  );
  assert.deepEqual(adminDocuments.map((document) => document.id), ["doc-own", "doc-same-tenant-other-driver"]);

  const driverDocuments = filterProfileDocumentsForViewer(
    { id: "driver-a", role: "driver", accountType: "operations", organizationId: "tenant-a" },
    documents
  );
  assert.deepEqual(driverDocuments.map((document) => document.id), ["doc-own"]);

  const hiddenForViewer = sanitizeProfileForViewer(
    { id: "viewer-a", role: "viewer", accountType: "company_owner", organizationId: "tenant-a" },
    { user: { id: "viewer-a" }, documents }
  );
  assert.deepEqual(hiddenForViewer.documents, []);
}

function main() {
  testOperationalSelfServiceIsPersonalOnly();
  testAvatarAuthorityRejectsEphemeralAndOversizedValues();
  testCompanyAdministratorKeepsCommercialSelfServiceWithoutSchedule();
  testLimitedPortalRolesRemainPersonalOnly();
  testOperationalAdminDoesNotBecomeCompanyEditor();
  testFieldCatalogsRemainExplicit();
  testProfileIdentityIsImmutableAfterCreation();
  testProfileDocumentsRemainTenantScoped();
  console.log("ok - profile self-service, avatar persistence and immutable identity authority");
}

main();
