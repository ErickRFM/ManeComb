const { NOTIFICATION_METHODS } = require("../data/repositories/notification-repository");
const { StoreDomainService, exposeRepositoryMethods } = require("./store-domain-service");

class NotificationService extends StoreDomainService {
  constructor(repository) {
    super(repository);
    exposeRepositoryMethods(this, NOTIFICATION_METHODS);
  }
}

module.exports = {
  NotificationService
};
