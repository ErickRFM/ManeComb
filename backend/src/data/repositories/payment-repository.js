const { StoreDomainRepository } = require("./store-domain-repository");
const { getUserOrganizationId, toPlain } = require("../serializers");
const { evaluatePaymentTransition } = require("../../services/commercial-payment");
const { randomUUID } = require("crypto");
const { buildCheckoutReservation, CHECKOUT_LEASE_DURATION_MS } = require("../../services/checkout-idempotency");

const PAYMENT_METHODS = [
  "createCommercialOrder",
  "findCommercialOrderByExternalReference",
  "getCommercialOrderById",
  "listCommercialOrders",
  "listCommercialOrdersForUser",
  "applyPaymentTransitionAtomically",
  "claimPaymentEffects",
  "completePaymentEffects",
  "claimCheckoutCreation",
  "completeCheckoutCreation",
  "failCheckoutCreation",
  "claimRefundOperation",
  "completeRefundOperation",
  "failRefundOperation",
  "listRefundOperations",
  "upsertChargeback",
  "listChargebacks",
  "findCommercialOrderByProviderPaymentId",
  "reserveRefundAmount",
  "claimTrialEntitlement",
  "updateCommercialOrder"
];

class PaymentRepository extends StoreDomainRepository {
  constructor(store, { CommercialLeadModel, CheckoutIdempotencyModel, TrialEntitlementModel, RefundOperationModel, ChargebackModel } = {}) {
    super(store, PAYMENT_METHODS);
    this.CommercialLeadModel = CommercialLeadModel || null;
    this.CheckoutIdempotencyModel = CheckoutIdempotencyModel || null;
    this.TrialEntitlementModel = TrialEntitlementModel || null;
    this.RefundOperationModel = RefundOperationModel || null;
    this.ChargebackModel = ChargebackModel || null;
  }

  async claimRefundOperation(payload) {
    if (!this.RefundOperationModel) return this.store.claimRefundOperation(payload);
    const now = payload.now || new Date();
    const leaseUntil = new Date(now.getTime() + 60_000);
    try {
      const created = await this.RefundOperationModel.findOneAndUpdate(
        { organizationId: payload.organizationId, idempotencyKeyHash: payload.idempotencyKeyHash },
        { $setOnInsert: { _id: randomUUID(), provider: "mercado_pago", ...payload, status: "processing", requestedAt: now, leaseOwner: payload.workerId, leaseUntil, attemptCount: 1 } },
        { upsert: true, returnDocument: "after" }
      ).lean();
      if (created.leaseOwner === payload.workerId && Number(created.attemptCount) === 1) return { claimed: true, reason: "new", operation: this.serialize(created) };
    } catch (error) { if (error?.code !== 11000) throw error; }
    const current = await this.RefundOperationModel.findOne({ organizationId: payload.organizationId, idempotencyKeyHash: payload.idempotencyKeyHash }).lean();
    if (current.requestFingerprint !== payload.requestFingerprint) return { claimed: false, reason: "key_reused", operation: this.serialize(current) };
    if (current.status === "confirmed") return { claimed: false, reason: "ready", operation: this.serialize(current) };
    if (current.status === "provider_result_unknown") return { claimed: false, reason: "provider_result_unknown", operation: this.serialize(current) };
    const recovered = await this.RefundOperationModel.findOneAndUpdate(
      { _id: current._id, $or: [{ status: "failed_retryable" }, { status: "processing", leaseUntil: { $lte: now } }] },
      { $set: { status: "processing", leaseOwner: payload.workerId, leaseUntil, lastErrorCode: null }, $inc: { attemptCount: 1 } },
      { returnDocument: "after" }
    ).lean();
    return recovered ? { claimed: true, reason: "recovered", operation: this.serialize(recovered) } : { claimed: false, reason: "currently_processing", operation: this.serialize(current) };
  }

  async completeRefundOperation({ operationId, workerId, providerRefundId, safeResponse }) {
    if (!this.RefundOperationModel) return this.store.completeRefundOperation({ operationId, workerId, providerRefundId, safeResponse });
    return this.serialize(await this.RefundOperationModel.findOneAndUpdate({ _id: operationId, leaseOwner: workerId, status: "processing" }, { $set: { status: "confirmed", providerRefundId, safeResponse, confirmedAt: new Date(), leaseOwner: null, leaseUntil: null } }, { returnDocument: "after" }).lean());
  }

  async failRefundOperation({ operationId, workerId, status, errorCode }) {
    if (!this.RefundOperationModel) return this.store.failRefundOperation({ operationId, workerId, status, errorCode });
    return this.serialize(await this.RefundOperationModel.findOneAndUpdate({ _id: operationId, leaseOwner: workerId, status: "processing" }, { $set: { status, lastErrorCode: errorCode, failedAt: new Date(), leaseOwner: null, leaseUntil: null } }, { returnDocument: "after" }).lean());
  }

  async listRefundOperations(orderId) {
    if (!this.RefundOperationModel) return this.store.listRefundOperations(orderId);
    return (await this.RefundOperationModel.find({ orderId }).lean()).map((entry) => this.serialize(entry));
  }

  async upsertChargeback(payload) {
    if (!this.ChargebackModel) return this.store.upsertChargeback(payload);
    return this.serialize(await this.ChargebackModel.findOneAndUpdate({ provider: payload.provider, providerChargebackId: payload.providerChargebackId }, { $set: payload, $setOnInsert: { _id: randomUUID(), openedAt: payload.updatedAt } }, { upsert: true, returnDocument: "after" }).lean());
  }

  async listChargebacks(orderId) {
    if (!this.ChargebackModel) return this.store.listChargebacks(orderId);
    return (await this.ChargebackModel.find({ orderId }).lean()).map((entry) => this.serialize(entry));
  }

  async findCommercialOrderByProviderPaymentId(paymentId) {
    if (!this.CommercialLeadModel) return this.store.findCommercialOrderByProviderPaymentId(paymentId);
    return this.serialize(await this.CommercialLeadModel.findOne({ providerPaymentId: paymentId }).lean());
  }

  async reserveRefundAmount({ orderId, organizationId, amountMinor, paidAmountMinor }) {
    if (!this.CommercialLeadModel) return this.store.reserveRefundAmount({ orderId, organizationId, amountMinor, paidAmountMinor });
    const order = await this.CommercialLeadModel.findOneAndUpdate(
      { _id: orderId, organizationId, paymentStatus: "paid", $expr: { $lte: [{ $add: [{ $ifNull: ["$refundReservedMinor", 0] }, amountMinor] }, paidAmountMinor] } },
      { $inc: { refundReservedMinor: amountMinor } },
      { returnDocument: "after" }
    ).lean();
    return this.serialize(order);
  }

  async claimTrialEntitlement({ organizationId, orderId, planId, trialStartedAt, trialEndsAt }) {
    if (!this.TrialEntitlementModel) return this.store.claimTrialEntitlement({ organizationId, orderId, planId, trialStartedAt, trialEndsAt });
    try {
      const entitlement = await this.TrialEntitlementModel.findOneAndUpdate(
        { organizationId },
        {
          $setOnInsert: {
            _id: randomUUID(), organizationId, orderId, planId, status: "active",
            trialStartedAt, trialEndsAt, consumedAt: trialStartedAt, createdAt: trialStartedAt
          }
        },
        { upsert: true, returnDocument: "after" }
      ).lean();
      const serialized = this.serialize(entitlement);
      return { claimed: serialized.orderId === orderId, reason: serialized.orderId === orderId ? "claimed" : "trial_already_consumed", entitlement: serialized };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const entitlement = await this.TrialEntitlementModel.findOne({ organizationId }).lean();
      const serialized = this.serialize(entitlement);
      return { claimed: serialized?.orderId === orderId, reason: serialized?.orderId === orderId ? "claimed" : "trial_already_consumed", entitlement: serialized };
    }
  }

  async claimCheckoutCreation({ scope, keyHash, requestFingerprint, workerId, now = new Date() }) {
    if (!this.CheckoutIdempotencyModel) {
      return this.store.claimCheckoutCreation({ scope, keyHash, requestFingerprint, workerId, now });
    }
    const leaseUntil = new Date(now.getTime() + CHECKOUT_LEASE_DURATION_MS);
    const reservation = buildCheckoutReservation({ scope, keyHash, requestFingerprint, workerId, now });
    try {
      const created = await this.CheckoutIdempotencyModel.findOneAndUpdate(
        { scope, keyHash },
        { $setOnInsert: { ...reservation, _id: reservation.id } },
        { upsert: true, returnDocument: "after" }
      ).lean();
      if (created.leaseOwner === workerId && created.attemptCount === 1) {
        return { claimed: true, reason: "new", reservation: this.serialize(created) };
      }
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
    const current = await this.CheckoutIdempotencyModel.findOne({ scope, keyHash }).lean();
    if (!current) throw new Error("Checkout idempotency reservation disappeared");
    if (current.requestFingerprint !== requestFingerprint) {
      return { claimed: false, reason: "key_reused", reservation: this.serialize(current) };
    }
    if (current.status === "ready") return { claimed: false, reason: "ready", reservation: this.serialize(current) };
    if (current.status === "failed_permanent") return { claimed: false, reason: "permanent_failure", reservation: this.serialize(current) };
    if (current.status === "provider_result_unknown") return { claimed: false, reason: "provider_result_unknown", reservation: this.serialize(current) };
    const recovered = await this.CheckoutIdempotencyModel.findOneAndUpdate(
      {
        _id: current._id,
        requestFingerprint,
        $or: [
          { status: "failed_retryable" },
          { status: "initializing", leaseUntil: { $lte: now } }
        ]
      },
      {
        $set: { status: "initializing", leaseOwner: workerId, leaseUntil, updatedAt: now, lastErrorCode: null },
        $inc: { attemptCount: 1 }
      },
      { returnDocument: "after" }
    ).lean();
    if (recovered) {
      return { claimed: true, reason: current.status === "failed_retryable" ? "retry" : "expired_lease", reservation: this.serialize(recovered) };
    }
    return { claimed: false, reason: "currently_processing", reservation: this.serialize(current) };
  }

  async completeCheckoutCreation({ reservationId, workerId, safeResponse }) {
    if (!this.CheckoutIdempotencyModel) return this.store.completeCheckoutCreation({ reservationId, workerId, safeResponse });
    const reservation = await this.CheckoutIdempotencyModel.findOneAndUpdate(
      { _id: reservationId, leaseOwner: workerId, status: "initializing" },
      { $set: { status: "ready", safeResponse, readyAt: new Date(), updatedAt: new Date(), leaseOwner: null, leaseUntil: null } },
      { returnDocument: "after" }
    ).lean();
    return this.serialize(reservation);
  }

  async failCheckoutCreation({ reservationId, workerId, status, errorCode }) {
    if (!this.CheckoutIdempotencyModel) return this.store.failCheckoutCreation({ reservationId, workerId, status, errorCode });
    const reservation = await this.CheckoutIdempotencyModel.findOneAndUpdate(
      { _id: reservationId, leaseOwner: workerId, status: "initializing" },
      { $set: { status, lastErrorCode: errorCode, failedAt: new Date(), updatedAt: new Date(), leaseOwner: null, leaseUntil: null } },
      { returnDocument: "after" }
    ).lean();
    return this.serialize(reservation);
  }

  serialize(order) {
    return toPlain(order);
  }

  async getCommercialOrderById(orderId) {
    if (!this.CommercialLeadModel) {
      return this.store.getCommercialOrderById(orderId);
    }

    if (!orderId) {
      return null;
    }

    const order = await this.CommercialLeadModel.findById(orderId).lean();
    return this.serialize(order);
  }

  async listCommercialOrders() {
    if (!this.CommercialLeadModel) {
      return this.store.listCommercialOrders();
    }

    const orders = await this.CommercialLeadModel.find().sort({ createdAt: -1 }).lean();
    return orders.map((order) => this.serialize(order));
  }

  async listCommercialOrdersForUser(user) {
    if (!this.CommercialLeadModel) {
      return this.store.listCommercialOrdersForUser(user);
    }

    const organizationId = getUserOrganizationId(user);

    if (!user?.id && !user?.email && !organizationId) {
      return [];
    }

    const normalizedEmail = String(user.email || "").trim().toLowerCase();
    const orders = await this.CommercialLeadModel.find({
      $or: [
        { ownerUserId: user.id || null },
        ...(organizationId ? [{ organizationId }, { organizationSlug: organizationId }] : []),
        ...(normalizedEmail
          ? [{ ownerAccountEmail: normalizedEmail }, { email: normalizedEmail }]
          : [])
      ]
    })
      .sort({ createdAt: -1 })
      .lean();

    return orders.map((order) => this.serialize(order));
  }

  async findCommercialOrderByExternalReference(externalReference) {
    if (!this.CommercialLeadModel) {
      return this.store.findCommercialOrderByExternalReference(externalReference);
    }

    const order = await this.CommercialLeadModel.findOne({
      $or: [
        { paymentExternalReference: externalReference },
        { referenceCode: externalReference }
      ]
    }).lean();

    return this.serialize(order);
  }

  async updateCommercialOrder(orderId, payload) {
    if (!this.CommercialLeadModel) {
      return this.store.updateCommercialOrder(orderId, payload);
    }

    const update = {};

    Object.entries(payload || {}).forEach(([key, value]) => {
      if (typeof value !== "undefined") {
        update[key] = value;
      }
    });

    const order = await this.CommercialLeadModel.findByIdAndUpdate(
      orderId,
      { $set: update },
      { returnDocument: "after" }
    ).lean();

    return this.serialize(order);
  }

  async applyPaymentTransitionAtomically({ orderId, provider, paymentId, incomingStatus, confirmation }) {
    if (!this.CommercialLeadModel) {
      return this.store.applyPaymentTransitionAtomically({ orderId, provider, paymentId, incomingStatus, confirmation });
    }
    const normalizedIncoming = String(incomingStatus || "").toLowerCase() === "approved" ? "paid" : String(incomingStatus || "").toLowerCase();
    if (!["pending", "paid", "rejected", "cancelled"].includes(normalizedIncoming)) {
      return { applied: false, reason: "unknown_status", shouldActivate: false, shouldNotify: false };
    }
    const transitionKey = `${String(paymentId)}:${normalizedIncoming}`;
    const filter = {
      _id: orderId,
      appliedPaymentTransitions: { $ne: transitionKey },
      $or: [{ providerPaymentId: null }, { providerPaymentId: "" }, { providerPaymentId: paymentId }]
    };
    if (normalizedIncoming !== "paid") filter.paymentStatus = { $ne: "paid" };
    try {
      const previous = await this.CommercialLeadModel.findOneAndUpdate(
        filter,
        {
          $set: {
            paymentProvider: provider,
            providerPaymentId: paymentId,
            paymentProviderReference: paymentId,
            paymentExternalReference: confirmation.paymentExternalReference,
            paymentStatus: normalizedIncoming,
            paymentApprovedAt: normalizedIncoming === "paid" ? confirmation.approvedAt : null,
            activationStatus: normalizedIncoming === "paid" ? "ready_for_activation" : "pending_payment",
            ...(normalizedIncoming === "paid"
              ? { paymentEffectsStatus: "pending", paymentEffectsTransition: transitionKey }
              : {})
          },
          $addToSet: { appliedPaymentTransitions: transitionKey }
        },
        { returnDocument: "before" }
      ).lean();
      if (!previous) {
        const current = await this.CommercialLeadModel.findById(orderId).lean();
        if (!current) return { applied: false, reason: "order_not_found", shouldActivate: false, shouldNotify: false };
        if (current.providerPaymentId && current.providerPaymentId !== paymentId) {
          return { applied: false, reason: "payment_linked_elsewhere", shouldActivate: false, shouldNotify: false };
        }
        const decision = evaluatePaymentTransition(current.paymentStatus, normalizedIncoming);
        return { applied: false, reason: decision.decision === "stale" ? "stale_transition" : "already_applied", shouldActivate: false, shouldNotify: false, order: this.serialize(current) };
      }
      const order = await this.CommercialLeadModel.findById(orderId).lean();
      const decision = evaluatePaymentTransition(previous.paymentStatus, normalizedIncoming);
      return { applied: true, previousStatus: previous.paymentStatus, currentStatus: normalizedIncoming, shouldActivate: decision.shouldActivate, shouldNotify: true, transitionKey, order: this.serialize(order) };
    } catch (error) {
      if (error?.code === 11000) return { applied: false, reason: "payment_linked_elsewhere", shouldActivate: false, shouldNotify: false };
      throw error;
    }
  }

  async claimPaymentEffects({ orderId, transitionKey, workerId, leaseUntil, now = new Date() }) {
    if (!this.CommercialLeadModel) return this.store.claimPaymentEffects({ orderId, transitionKey, workerId, leaseUntil, now });
    const order = await this.CommercialLeadModel.findOneAndUpdate(
      {
        _id: orderId,
        paymentEffectsTransition: transitionKey,
        $or: [
          { paymentEffectsStatus: "pending" },
          { paymentEffectsStatus: "processing", paymentEffectsLeaseUntil: { $lte: now } }
        ]
      },
      { $set: { paymentEffectsStatus: "processing", paymentEffectsLeaseUntil: leaseUntil, paymentEffectsWorker: workerId } },
      { returnDocument: "after" }
    ).lean();
    return { claimed: Boolean(order), order: this.serialize(order) };
  }

  async completePaymentEffects({ orderId, transitionKey, updates = {} }) {
    if (!this.CommercialLeadModel) return this.store.completePaymentEffects({ orderId, transitionKey, updates });
    const order = await this.CommercialLeadModel.findOneAndUpdate(
      { _id: orderId, paymentEffectsTransition: transitionKey, paymentEffectsStatus: "processing" },
      {
        $set: {
          ...updates,
          paymentEffectsStatus: "completed",
          paymentEffectsCompletedAt: new Date(),
          paymentEffectsLeaseUntil: null,
          paymentEffectsWorker: null
        }
      },
      { returnDocument: "after" }
    ).lean();
    return this.serialize(order);
  }
}

module.exports = {
  PAYMENT_METHODS,
  PaymentRepository
};
