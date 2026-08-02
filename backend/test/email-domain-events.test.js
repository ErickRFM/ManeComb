const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const communication = require("../modules/communication");
const { createEmbeddedStore } = require("../src/data/store");
const {
  isChargebackNotifiableStatus,
  resolveDocumentRecipient,
  sendAccountLifecycleEmail,
  sendChargebackUpdatedEmail,
  sendDocumentEmail,
  sendRefundConfirmedEmail,
  sendSecurityChangeEmail,
  sendWelcomeEmail
} = require("../src/services/domain-email-events");

function assertValidEmailInput(input) {
  const validation = communication.validators.validateSendEmailInput(input);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.valid, true);
}

function assertPersistedBeforeEmail(relativePath, persistedMarker, emailMarker) {
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");
  assert.ok(source.includes(persistedMarker), `${relativePath} debe contener ${persistedMarker}`);
  assert.ok(source.includes(emailMarker), `${relativePath} debe contener ${emailMarker}`);
  assert.ok(
    source.indexOf(persistedMarker) < source.lastIndexOf(emailMarker),
    `${relativePath} debe persistir antes de producir el correo`
  );
}

async function run() {
  assertPersistedBeforeEmail("../src/modules/account/routes.js", "completeRefundOperation", "sendRefundConfirmedEmail");
  assertPersistedBeforeEmail("../src/modules/activation-keys/routes.js", "registerDriverWithActivationKey", "sendWelcomeEmail(activation.user)");
  assertPersistedBeforeEmail("../src/modules/auth/routes.js", "resetPasswordWithToken", "sendSecurityChangeEmail(user");
  assertPersistedBeforeEmail("../src/modules/commercial/routes.js", "upsertChargeback", "sendChargebackUpdatedEmail");
  assertPersistedBeforeEmail("../src/modules/documents/routes.js", "createDocument", "sendDocumentEventSafely(req.app.locals.store, hydratedDocument");
  assertPersistedBeforeEmail("../src/modules/users/routes.js", "store.createUser", "sendWelcomeEmail(user)");
  const producerSource = fs.readFileSync(
    path.resolve(__dirname, "../src/services/domain-email-events.js"),
    "utf8"
  );
  assert.ok(!producerSource.includes("Date.now("));
  assert.ok(!producerSource.includes("Math.random("));
  assert.ok(!producerSource.includes("requestId"));

  const store = createEmbeddedStore();
  const originalSendEmail = communication.sendEmail;
  const captured = [];
  communication.sendEmail = async (input) => {
    captured.push(input);
    return communication.deliveryResults.createDeliveryResult({
      status: "dry_run",
      deliveryId: `delivery-${captured.length}`
    });
  };

  try {
    const created = await store.createUser({
      id: "user-email-events",
      name: "Persona de prueba",
      email: "events@example.com",
      password: "Ruta123!",
      role: "driver",
      organizationId: "org-email-events"
    });

    await sendWelcomeEmail(created);
    assert.equal(captured.at(-1).eventType, "WELCOME");
    assert.equal(captured.at(-1).idempotencyKey, `welcome:${created.id}`);
    assert.equal(captured.at(-1).tenantScope, "organization:org-email-events");
    assertValidEmailInput(captured.at(-1));

    const unchangedActive = await store.updateUser(created.id, { userStatus: "active" });
    assert.equal(Number(unchangedActive.accountStatusVersion || 0), 0);
    const suspended = await store.updateUser(created.id, { userStatus: "suspended" });
    assert.equal(suspended.accountStatusVersion, 1);
    assert.ok(suspended.suspendedAt);
    await sendAccountLifecycleEmail(suspended, "ACCOUNT_SUSPENDED");
    const suspension = captured.at(-1);
    assert.match(suspension.idempotencyKey, /^account-suspended:user-email-events:\d{4}-/);
    assert.ok(!suspension.idempotencyKey.includes(suspended.email));
    assertValidEmailInput(suspension);
    const duplicateSuspension = await store.updateUser(created.id, { userStatus: "suspended" });
    assert.equal(duplicateSuspension.accountStatusVersion, 1);
    assert.equal(duplicateSuspension.suspendedAt, suspended.suspendedAt);

    const reactivated = await store.updateUser(created.id, { userStatus: "active" });
    assert.equal(reactivated.accountStatusVersion, 2);
    assert.ok(reactivated.reactivatedAt);
    await sendAccountLifecycleEmail(reactivated, "ACCOUNT_REACTIVATED");
    assert.equal(captured.at(-1).idempotencyKey, "account-reactivated:user-email-events:2");
    assertValidEmailInput(captured.at(-1));

    const unchangedEmail = await store.updateUser(created.id, { email: created.email });
    assert.equal(Number(unchangedEmail.credentialVersion || 0), 0);
    const changedEmail = await store.updateUser(created.id, { email: "changed@example.com" });
    assert.equal(changedEmail.credentialVersion, 1);
    assert.ok(changedEmail.emailChangedAt);
    await sendSecurityChangeEmail(changedEmail, "EMAIL_CHANGED");
    assert.equal(captured.at(-1).idempotencyKey, "email-changed:user-email-events:1");
    assert.equal(captured.at(-1).recipient.email, "changed@example.com");
    assertValidEmailInput(captured.at(-1));

    const changedPassword = await store.updateUser(created.id, { password: "OtraRuta123!" });
    assert.equal(changedPassword.credentialVersion, 2);
    assert.ok(changedPassword.passwordChangedAt);
    await sendSecurityChangeEmail(changedPassword, "PASSWORD_CHANGED");
    assert.equal(captured.at(-1).idempotencyKey, "password-changed:user-email-events:2");
    assertValidEmailInput(captured.at(-1));

    const order = {
      id: "order-email-events",
      organizationId: "org-email-events",
      ownerUserId: created.id,
      ownerAccountEmail: "billing@example.com",
      email: "request-controlled@example.net",
      contactName: "Titular verificado",
      referenceCode: "ORD-EVENTS"
    };
    await sendRefundConfirmedEmail(order, {
      providerRefundId: "refund-provider-01",
      amountMinor: 12345,
      currency: "MXN",
      status: "confirmed"
    });
    const refund = captured.at(-1);
    assert.equal(refund.recipient.email, "billing@example.com");
    assert.equal(refund.idempotencyKey, "refund-confirmed:refund-provider-01");
    assert.equal(refund.data.amount, "123.45");
    assertValidEmailInput(refund);

    assert.equal(isChargebackNotifiableStatus("in_review"), true);
    assert.equal(isChargebackNotifiableStatus("unknown"), false);
    await sendChargebackUpdatedEmail(order, {
      providerChargebackId: "chargeback-provider-01",
      amountMinor: 5000,
      currency: "MXN",
      status: "in_review"
    });
    assert.equal(captured.at(-1).idempotencyKey, "chargeback:chargeback-provider-01:in_review");
    assertValidEmailInput(captured.at(-1));
    const beforeSkippedChargeback = captured.length;
    const skippedChargeback = await sendChargebackUpdatedEmail(order, {
      providerChargebackId: "chargeback-provider-02",
      status: "unknown"
    });
    assert.equal(skippedChargeback.status, "skipped");
    assert.equal(captured.length, beforeSkippedChargeback);

    const driverDocument = await store.createDocument({
      organizationId: "manecomb-demo",
      ownerType: "driver",
      ownerId: "user-driver-01",
      name: "Licencia",
      category: "driver_license",
      expiresAt: "2030-01-01T00:00:00.000Z",
      uploadedBy: "user-admin-01"
    });
    const driverRecipient = await resolveDocumentRecipient(store, driverDocument);
    assert.equal(driverRecipient.user.id, "user-driver-01");
    await sendDocumentEmail(driverDocument, driverRecipient, "DOCUMENT_UPLOADED");
    assert.equal(captured.at(-1).idempotencyKey, `document-uploaded:${driverDocument.id}:recipient:user-driver-01`);
    assertValidEmailInput(captured.at(-1));

    const approved = await store.reviewDocument(driverDocument.id, {
      reviewStatus: "approved",
      reviewNotes: "Verificado",
      reviewedBy: "user-admin-01"
    });
    assert.equal(approved.reviewChanged, true);
    assert.equal(approved.reviewVersion, 1);
    await sendDocumentEmail(approved, driverRecipient, "DOCUMENT_APPROVED");
    assert.equal(captured.at(-1).idempotencyKey, `document-approved:${driverDocument.id}:1`);
    assertValidEmailInput(captured.at(-1));
    const sameReview = await store.reviewDocument(driverDocument.id, {
      reviewStatus: "approved",
      reviewNotes: "Verificado",
      reviewedBy: "user-admin-01"
    });
    assert.equal(sameReview.reviewChanged, false);
    assert.equal(sameReview.reviewVersion, 1);
    const rejected = await store.reviewDocument(driverDocument.id, {
      reviewStatus: "rejected",
      reviewNotes: "Imagen ilegible",
      reviewedBy: "user-admin-01"
    });
    assert.equal(rejected.reviewVersion, 2);
    await sendDocumentEmail(rejected, driverRecipient, "DOCUMENT_REJECTED");
    assert.equal(captured.at(-1).idempotencyKey, `document-rejected:${driverDocument.id}:2`);
    assertValidEmailInput(captured.at(-1));

    const vehicleDocument = await store.createDocument({
      organizationId: "manecomb-demo",
      ownerType: "vehicle",
      ownerId: "vehicle-101",
      name: "Tarjeta de circulaciÃ³n",
      category: "registration_card",
      expiresAt: "2030-01-01T00:00:00.000Z",
      uploadedBy: "user-admin-01"
    });
    const vehicleRecipient = await resolveDocumentRecipient(store, vehicleDocument);
    assert.equal(vehicleRecipient.user.id, "user-driver-01");
    assert.match(vehicleRecipient.label, /CB-101|CMB-101/);
    assert.equal(
      await resolveDocumentRecipient(store, { ...vehicleDocument, organizationId: "other-org" }),
      null
    );
    const unassignedDocument = await store.createDocument({
      organizationId: "manecomb-demo",
      ownerType: "vehicle",
      ownerId: "vehicle-310",
      name: "Seguro",
      category: "insurance",
      expiresAt: "2030-01-01T00:00:00.000Z",
      uploadedBy: "user-admin-01"
    });
    assert.equal(await resolveDocumentRecipient(store, unassignedDocument), null);

    communication.sendEmail = async () => {
      throw new Error("provider secret response for events@example.com");
    };
    const isolatedFailure = await sendWelcomeEmail(created);
    assert.equal(isolatedFailure.status, "failed");
    assert.ok(!JSON.stringify(isolatedFailure).includes("events@example.com"));
  } finally {
    communication.sendEmail = originalSendEmail;
  }

  console.log("ok - eventos de dominio de correo usan transiciones, destinatarios y claves estables");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
