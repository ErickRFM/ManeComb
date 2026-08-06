const ACCOUNT_CHANNEL = Object.freeze({
  BLOCKED: "blocked",
  COMPANY_PORTAL: "company_portal",
  MOBILE_OPERATIONS: "mobile_operations",
  PLATFORM_ADMIN: "platform_admin"
});

const ACCOUNT_CHANNEL_REASON = Object.freeze({
  ACCOUNT_SUSPENDED: "account_suspended",
  COMPANY_IDENTITY: "company_identity",
  INCOMPATIBLE_COMPANY_ROLE: "incompatible_company_role",
  INCOMPATIBLE_OPERATIONS_ROLE: "incompatible_operations_role",
  MISSING_USER: "missing_user",
  OPERATIONAL_IDENTITY: "operational_identity",
  PLATFORM_IDENTITY: "platform_identity",
  UNKNOWN_ACCOUNT_TYPE: "unknown_account_type"
});

const PORTAL_ROLES = new Set([
  "owner",
  "admin",
  "billing_manager",
  "support",
  "viewer"
]);

const OPERATIONAL_ROLES = new Set([
  "owner",
  "admin",
  "dispatcher",
  "supervisor",
  "driver",
  "conductor"
]);

const PLATFORM_ROLES = new Set([
  "platform_owner",
  "platform_admin",
  "platform_support",
  "platform_auditor"
]);

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function buildResolution(channel, reason) {
  return {
    channel,
    reason,
    canAccessPortal: channel === ACCOUNT_CHANNEL.COMPANY_PORTAL,
    canUseMobileProduct: channel === ACCOUNT_CHANNEL.MOBILE_OPERATIONS,
    isBlocked: channel === ACCOUNT_CHANNEL.BLOCKED
  };
}

function resolveAccountChannel(user) {
  if (!user) {
    return buildResolution(
      ACCOUNT_CHANNEL.BLOCKED,
      ACCOUNT_CHANNEL_REASON.MISSING_USER
    );
  }

  const role = normalize(user.role);
  const accountType = normalize(user.accountType);
  const userStatus = normalize(user.userStatus || "active");

  if (userStatus === "suspended") {
    return buildResolution(
      ACCOUNT_CHANNEL.BLOCKED,
      ACCOUNT_CHANNEL_REASON.ACCOUNT_SUSPENDED
    );
  }

  if (accountType === "platform_admin" || PLATFORM_ROLES.has(role)) {
    return buildResolution(
      ACCOUNT_CHANNEL.PLATFORM_ADMIN,
      ACCOUNT_CHANNEL_REASON.PLATFORM_IDENTITY
    );
  }

  if (accountType === "company_owner") {
    return PORTAL_ROLES.has(role)
      ? buildResolution(
          ACCOUNT_CHANNEL.COMPANY_PORTAL,
          ACCOUNT_CHANNEL_REASON.COMPANY_IDENTITY
        )
      : buildResolution(
          ACCOUNT_CHANNEL.BLOCKED,
          ACCOUNT_CHANNEL_REASON.INCOMPATIBLE_COMPANY_ROLE
        );
  }

  if (accountType === "operations") {
    return OPERATIONAL_ROLES.has(role)
      ? buildResolution(
          ACCOUNT_CHANNEL.MOBILE_OPERATIONS,
          ACCOUNT_CHANNEL_REASON.OPERATIONAL_IDENTITY
        )
      : buildResolution(
          ACCOUNT_CHANNEL.BLOCKED,
          ACCOUNT_CHANNEL_REASON.INCOMPATIBLE_OPERATIONS_ROLE
        );
  }

  return buildResolution(
    ACCOUNT_CHANNEL.BLOCKED,
    ACCOUNT_CHANNEL_REASON.UNKNOWN_ACCOUNT_TYPE
  );
}

function applyAccountChannel(user) {
  if (!user || typeof user !== "object") {
    return user;
  }

  const resolution = resolveAccountChannel(user);
  user.accountChannel = resolution.channel;
  user.accountChannelReason = resolution.reason;
  return user;
}

module.exports = {
  ACCOUNT_CHANNEL,
  ACCOUNT_CHANNEL_REASON,
  OPERATIONAL_ROLES,
  PLATFORM_ROLES,
  PORTAL_ROLES,
  applyAccountChannel,
  resolveAccountChannel
};
