const PLATFORM_ROLES = [
  "platform_owner",
  "platform_admin",
  "platform_support",
  "platform_finance",
  "platform_viewer"
];

const PLATFORM_PERMISSIONS = {
  platform_owner: [
    "platform.users.manage",
    "platform.sessions.manage",
    "platform.companies.read",
    "platform.commercial.read",
    "platform.commercial.manage",
    "platform.system.read",
    "platform.audit.read",
    "platform.actions.execute"
  ],
  platform_admin: [
    "platform.users.manage",
    "platform.sessions.manage",
    "platform.companies.read",
    "platform.commercial.read",
    "platform.commercial.manage",
    "platform.system.read",
    "platform.audit.read"
  ],
  platform_support: [
    "platform.companies.read",
    "platform.system.read",
    "platform.audit.read"
  ],
  platform_finance: [
    "platform.companies.read",
    "platform.commercial.read",
    "platform.commercial.manage",
    "platform.audit.read"
  ],
  platform_viewer: [
    "platform.companies.read",
    "platform.system.read"
  ]
};

function hasPlatformPermission(role, permission) {
  if (!role || !permission) return false;
  const permissions = PLATFORM_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.includes(permission);
}

function getPlatformPermissions(role) {
  return PLATFORM_PERMISSIONS[role] || [];
}

module.exports = {
  PLATFORM_ROLES,
  PLATFORM_PERMISSIONS,
  hasPlatformPermission,
  getPlatformPermissions
};
