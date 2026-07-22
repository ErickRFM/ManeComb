const { StoreDomainRepository } = require("./store-domain-repository");
const { getUserOrganizationId, toPlain } = require("../serializers");
const { evaluatePaymentTransition } = require("../../services/commercial-payment");

const PAYMENT_METHODS = [
  "createCommercialOrder",
  "findCommercialOrderByExternalReference",
  "getCommercialOrderById",
  "listCommercialOrders",
  "listCommercialOrdersForUser",
  "applyPaymentTransitionAtomically",
  "claimPaymentEffects",
  "completePaymentEffects",
  "updateCommercialOrder"
];

class PaymentRepository extends StoreDomainRepository {
  constructor(store, { CommercialLeadModel } = {}) {
    super(store, PAYMENT_METHODS);
    this.CommercialLeadModel = CommercialLeadModel || null;
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
