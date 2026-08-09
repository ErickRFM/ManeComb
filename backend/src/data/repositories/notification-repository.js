const { StoreDomainRepository } = require("./store-domain-repository");
const { getEnterpriseOrganizationId, mapMaybePromise } = require("./tenant-repository-utils");

const NOTIFICATION_METHODS = [
  "createNotification",
  "getNotificationsForUser",
  "markNotificationAsRead"
];

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

  getNotificationsForUser(user) {
    return mapMaybePromise(
      this.store.getNotificationsForUser(user),
      (notifications) => scopeNotificationsToEnterpriseUser(notifications, user)
    );
  }

  markNotificationAsRead(notificationId, userId) {
    return mapMaybePromise(this.store.getUserById?.(userId), (user) => {
      if (!user) return null;

      return mapMaybePromise(this.getNotificationsForUser(user), (allowed) => {
        if (!allowed.some((notification) => String(notification.id) === String(notificationId))) {
          return null;
        }

        return this.store.markNotificationAsRead(notificationId, userId);
      });
    });
  }
}

module.exports = {
  NOTIFICATION_METHODS,
  NotificationRepository,
  isNotificationVisibleToUser,
  scopeNotificationsToEnterpriseUser
};
