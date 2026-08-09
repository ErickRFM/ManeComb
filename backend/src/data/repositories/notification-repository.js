const { StoreDomainRepository } = require("./store-domain-repository");

const NOTIFICATION_METHODS = [
  "createNotification",
  "getNotificationsForUser",
  "markNotificationAsRead"
];

function getEnterpriseOrganizationId(user) {
  return String(user?.organizationId || user?.companyId || "").trim();
}

function isNotificationVisibleToUser(notification, user) {
  if (!notification || !user) return false;

  const organizationId = getEnterpriseOrganizationId(user);
  if (!organizationId) return false;
  if (String(notification.organizationId || "").trim() !== organizationId) return false;

  const targetUserIds = Array.isArray(notification.targetUserIds)
    ? notification.targetUserIds.map(String)
    : [];
  const targetRoles = Array.isArray(notification.targetRoles)
    ? notification.targetRoles.map(String)
    : [];

  return targetUserIds.includes(String(user.id || "")) || targetRoles.includes(String(user.role || ""));
}

function scopeNotificationsToEnterpriseUser(notifications, user) {
  const items = Array.isArray(notifications) ? notifications : [];
  if (!user) return [];
  return items.filter((notification) => isNotificationVisibleToUser(notification, user));
}

class NotificationRepository extends StoreDomainRepository {
  constructor(store) {
    super(store, NOTIFICATION_METHODS);
  }

  async getNotificationsForUser(user) {
    const notifications = await Promise.resolve(this.store.getNotificationsForUser(user));
    return scopeNotificationsToEnterpriseUser(notifications, user);
  }

  async markNotificationAsRead(notificationId, userId) {
    const user = await Promise.resolve(this.store.getUserById?.(userId));
    if (!user) return null;

    const allowed = await this.getNotificationsForUser(user);
    if (!allowed.some((notification) => String(notification.id) === String(notificationId))) {
      return null;
    }

    return Promise.resolve(this.store.markNotificationAsRead(notificationId, userId));
  }
}

module.exports = {
  NOTIFICATION_METHODS,
  NotificationRepository,
  getEnterpriseOrganizationId,
  isNotificationVisibleToUser,
  scopeNotificationsToEnterpriseUser
};
