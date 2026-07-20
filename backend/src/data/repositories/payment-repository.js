const { StoreDomainRepository } = require("./store-domain-repository");
const { getUserOrganizationId, toPlain } = require("../serializers");

const PAYMENT_METHODS = [
  "createCommercialOrder",
  "findCommercialOrderByExternalReference",
  "getCommercialOrderById",
  "listCommercialOrders",
  "listCommercialOrdersForUser",
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
}

module.exports = {
  PAYMENT_METHODS,
  PaymentRepository
};
