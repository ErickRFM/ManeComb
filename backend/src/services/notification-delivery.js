const { sendExpoPushNotifications } = require("./push-notifier");

function uniquePushSubscriptions(subscriptions) {
  const seen = new Set();

  return (Array.isArray(subscriptions) ? subscriptions : []).filter((entry) => {
    const token = String(entry?.token || "").trim();

    if (!token || seen.has(token)) {
      return false;
    }

    seen.add(token);
    return true;
  });
}

async function deliverOperationalNotification({ io, store, payload, persist = true }) {
  if (persist && !store?.createNotification) {
    return null;
  }

  const targetRoles = Array.isArray(payload.targetRoles) ? payload.targetRoles : [];
  const targetUserIds = Array.isArray(payload.targetUserIds) ? payload.targetUserIds : [];
  const organizationId = String(payload.organizationId || "").trim();
  const safeCategory = String(payload.category || "system").trim() || "system";
  const safeData = {
    ...(payload.data || {}),
    category: safeCategory,
    deepLink: payload.deepLink || payload.data?.deepLink || null
  };
  const notification = persist
    ? await store.createNotification({
        title: payload.title,
        body: payload.body,
        level: payload.level,
        organizationId,
        targetRoles,
        targetUserIds,
        category: safeCategory,
        data: safeData
      })
    : null;

  if (persist) {
    targetRoles.forEach((role) => {
      if (organizationId) {
        io?.to(`org:${organizationId}:role:${role}`).emit("notification:created", notification);
      }
    });
    targetUserIds.forEach((userId) => {
      io?.to(`user:${userId}`).emit("notification:created", notification);
    });
  }

  try {
    const [roleSubscriptions, userSubscriptions] = await Promise.all([
      targetRoles.length && store?.listPushSubscriptionsForRoles
        ? store.listPushSubscriptionsForRoles(targetRoles, organizationId)
        : [],
      targetUserIds.length && store?.listPushSubscriptionsForUsers
        ? store.listPushSubscriptionsForUsers(targetUserIds)
        : []
    ]);
    const subscriptions = uniquePushSubscriptions([
      ...(roleSubscriptions || []),
      ...(userSubscriptions || [])
    ]);

    if (!subscriptions.length) {
      return notification;
    }

    const pushResult = await sendExpoPushNotifications(subscriptions, {
      ...payload,
      category: safeCategory,
      data: safeData
    });
    await store.recordAppEvent?.({
      type: pushResult.failed ? "push_failed" : "push_sent",
      scope: "push",
      level: pushResult.failed ? "warning" : "info",
      status: pushResult.failed ? "partial" : "ok",
      message: `${pushResult.sent} push entregados, ${pushResult.failed} fallidos`,
      metadata: {
        sent: pushResult.sent,
        failed: pushResult.failed,
        targetRoles,
        targetUserIds,
        category: payload.category
      }
    });
  } catch (error) {
    await store.recordAppEvent?.({
      type: "push_failed",
      scope: "push",
      level: "danger",
      status: "failed",
      message: error.message || "No fue posible entregar notificaciones push",
      metadata: {
        targetRoles,
        targetUserIds,
        category: payload.category
      }
    });
  }

  return notification;
}

module.exports = {
  deliverOperationalNotification
};
