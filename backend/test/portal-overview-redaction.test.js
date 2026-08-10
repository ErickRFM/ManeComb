const assert = require("node:assert/strict");
const { buildPortalOverview } = require("../src/services/portal-account");

function main() {
  const user = {
    id: "user-viewer",
    name: "Viewer Portal",
    email: "viewer@manecomb.test",
    role: "viewer",
    accountType: "company_owner",
    organizationId: "org-redaction",
    userStatus: "active",
    companyProfile: { companyName: "Empresa Demo", taxId: "RFC-DEMO" }
  };
  const order = {
    id: "order-redaction",
    referenceCode: "MC-RED-001",
    companyName: "Empresa Demo",
    planId: "plan-4",
    planName: "4 unidades",
    fleetSize: 4,
    totalPrice: 159,
    status: "active",
    paymentStatus: "paid",
    activationStatus: "active",
    createdAt: "2026-08-08T12:00:00.000Z",
    billingProfile: {
      taxId: "RFC-DEMO",
      billingEmail: "billing@manecomb.test",
      billingAddress: "Direccion privada"
    },
    providerPaymentId: "provider-secret-id",
    paymentInstructions: { clabe: "000000000000000000" },
    downloads: [{ code: "invoice-summary", urlPath: "/api/commercial/downloads/invoice?token=secret" }],
    lastEmailError: "provider-internal-error"
  };

  const overview = buildPortalOverview({
    user,
    orders: [order],
    users: [user],
    activationKeys: []
  });

  assert.deepEqual(overview.latestOrder, {
    id: "order-redaction",
    referenceCode: "MC-RED-001",
    companyName: "Empresa Demo",
    planId: "plan-4",
    planName: "4 unidades",
    totalPrice: 159,
    status: "active",
    paymentStatus: "paid",
    createdAt: "2026-08-08T12:00:00.000Z"
  });
  assert.equal(overview.latestOrder.billingProfile, undefined);
  assert.equal(overview.latestOrder.providerPaymentId, undefined);
  assert.equal(overview.latestOrder.paymentInstructions, undefined);
  assert.equal(overview.latestOrder.downloads, undefined);
  assert.equal(overview.latestOrder.lastEmailError, undefined);

  console.log("ok - portal latest order redaction");
}

main();
