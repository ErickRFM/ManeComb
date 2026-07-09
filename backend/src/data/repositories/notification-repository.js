const { StoreDomainRepository } = require("./store-domain-repository");

const NOTIFICATION_METHODS = [
  "createNotification",
  "getNotificationsForUser",
  "markNotificationAsRead"
];

class NotificationRepository extends StoreDomainRepository {
  constructor(store) {
    super(store, NOTIFICATION_METHODS);
  }
}

module.exports = {
  NOTIFICATION_METHODS,
  NotificationRepository
};
