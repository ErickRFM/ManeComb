const { PAYMENT_METHODS } = require("../data/repositories/payment-repository");
const { StoreDomainService, exposeRepositoryMethods } = require("./store-domain-service");

class PaymentStoreService extends StoreDomainService {
  constructor(repository) {
    super(repository);
    exposeRepositoryMethods(this, PAYMENT_METHODS);
  }
}

module.exports = {
  PaymentStoreService
};
