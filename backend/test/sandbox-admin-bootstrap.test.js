const assert = require("node:assert/strict");
const {
  bootstrapSandboxAdmin,
  validateBootstrapEnvironment
} = require("../scripts/bootstrap-sandbox-admin");

const safeEnvironment = {
  ALLOW_SANDBOX_ADMIN_BOOTSTRAP: "true",
  MERCADO_PAGO_ENV: "sandbox",
  MONGO_DB_NAME: "manecomb_sandbox",
  MONGO_URI: "mongodb://example.invalid/test"
};

function assertRejectedEnvironment(overrides, expectedCode) {
  assert.throws(
    () => validateBootstrapEnvironment({ ...safeEnvironment, ...overrides }),
    (error) => error.code === expectedCode
  );
}

function createHarness(existingUser = null) {
  const createdUsers = [];
  const output = [];
  let connected = false;

  return {
    createdUsers,
    dependencies: {
      bcrypt: {
        async hash(password, rounds) {
          assert.equal(rounds, 10);
          return `hashed:${password.length}`;
        }
      },
      connect: async () => {
        connected = true;
      },
      credentials: {
        confirmation: "Secure123!",
        email: "ADMIN@EXAMPLE.TEST",
        password: "Secure123!"
      },
      disconnect: async () => {
        connected = false;
      },
      env: safeEnvironment,
      getConnectionState: () => ({ connected }),
      userModel: {
        async create(user) {
          createdUsers.push(user);
          return user;
        },
        findOne() {
          return {
            lean: async () => existingUser
          };
        }
      },
      uuid: () => "sandbox-admin-id"
    },
    output
  };
}

async function testEnvironmentGuards() {
  assertRejectedEnvironment(
    { MONGO_DB_NAME: "combisapp" },
    "sandbox_database_required"
  );
  assertRejectedEnvironment(
    { MONGO_DB_NAME: undefined },
    "sandbox_database_required"
  );
  assertRejectedEnvironment(
    { MERCADO_PAGO_ENV: "production" },
    "sandbox_payment_environment_required"
  );
  assertRejectedEnvironment(
    { MERCADO_PAGO_ENV: undefined },
    "sandbox_payment_environment_required"
  );
  assertRejectedEnvironment(
    { ALLOW_SANDBOX_ADMIN_BOOTSTRAP: undefined },
    "sandbox_bootstrap_authorization_required"
  );
  assertRejectedEnvironment(
    { MONGO_URI: undefined, MONGODB_URI: undefined },
    "mongo_configuration_required"
  );

  const aliasConfiguration = validateBootstrapEnvironment({
    ...safeEnvironment,
    MONGODB_URI: safeEnvironment.MONGO_URI,
    MONGO_URI: undefined
  });
  assert.equal(aliasConfiguration.mongoConfigured, true);
}

async function testCreatesIsolatedAdmin() {
  const harness = createHarness();
  const result = await bootstrapSandboxAdmin(harness.dependencies);

  assert.deepEqual(result, {
    created: true,
    database: "manecomb_sandbox",
    role: "admin",
    status: "created"
  });
  assert.equal(harness.createdUsers.length, 1);

  const created = harness.createdUsers[0];
  assert.equal(created.email, "admin@example.test");
  assert.equal(created.role, "admin");
  assert.equal(created.accountType, "operations");
  assert.equal(created.organizationId, "");
  assert.equal(created.userStatus, "active");
  assert.equal(created.passwordHash.startsWith("hashed:"), true);
  assert.equal(Object.hasOwn(created, "password"), false);
}

async function testIsIdempotentForExistingAdmin() {
  const harness = createHarness({
    accountType: "operations",
    role: "admin"
  });
  const result = await bootstrapSandboxAdmin(harness.dependencies);

  assert.equal(result.created, false);
  assert.equal(result.status, "already_exists");
  assert.equal(harness.createdUsers.length, 0);
}

async function testDoesNotPromoteExistingUser() {
  const harness = createHarness({
    accountType: "company_owner",
    role: "owner"
  });

  await assert.rejects(
    bootstrapSandboxAdmin(harness.dependencies),
    (error) => error.code === "conflicting_non_admin_user"
  );
  assert.equal(harness.createdUsers.length, 0);
}

async function testRejectsUnsafeCredentialsBeforeConnecting() {
  const mismatched = createHarness();
  mismatched.dependencies.credentials.confirmation = "Different123!";
  await assert.rejects(
    bootstrapSandboxAdmin(mismatched.dependencies),
    (error) => error.code === "password_confirmation_mismatch"
  );

  const weak = createHarness();
  weak.dependencies.credentials.password = "weak";
  weak.dependencies.credentials.confirmation = "weak";
  await assert.rejects(
    bootstrapSandboxAdmin(weak.dependencies),
    (error) => error.code === "password_policy_rejected"
  );
}

async function main() {
  await testEnvironmentGuards();
  await testCreatesIsolatedAdmin();
  await testIsIdempotentForExistingAdmin();
  await testDoesNotPromoteExistingUser();
  await testRejectsUnsafeCredentialsBeforeConnecting();
  console.log("ok - bootstrap de administrador Sandbox aislado e idempotente");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
