const { getPlatformPermissions } = require("../config/platform-roles");

function serializeCapabilities(role) {
  const permissions = getPlatformPermissions(role);
  return {
    role,
    permissions
  };
}

function serializeOverview(overviewData) {
  return {
    companies: {
      total: overviewData.companies?.total || 0
    },
    users: {
      total: overviewData.users?.total || 0,
      byStatus: {
        active: overviewData.users?.byStatus?.active || 0,
        pending: overviewData.users?.byStatus?.pending || 0,
        suspended: overviewData.users?.byStatus?.suspended || 0
      }
    },
    vehicles: {
      total: overviewData.vehicles?.total || 0,
      byStatus: {
        on_route: overviewData.vehicles?.byStatus?.on_route || 0,
        maintenance: overviewData.vehicles?.byStatus?.maintenance || 0,
        idle: overviewData.vehicles?.byStatus?.idle || 0
      }
    },
    commercialOrders: {
      total: overviewData.commercialOrders?.total || 0,
      byStatus: {
        pending: overviewData.commercialOrders?.byStatus?.pending || 0,
        active: overviewData.commercialOrders?.byStatus?.active || 0,
        completed: overviewData.commercialOrders?.byStatus?.completed || 0,
        cancelled: overviewData.commercialOrders?.byStatus?.cancelled || 0
      }
    }
  };
}

function serializePaginationMeta(meta) {
  return {
    page: meta.page,
    limit: meta.limit,
    total: meta.total,
    totalPages: meta.totalPages,
    hasNext: meta.hasNext,
    hasPrev: meta.hasPrev
  };
}

function serializeError(error) {
  return {
    code: error.code || "PLATFORM_INTERNAL_ERROR",
    message: error.message || "Error interno",
    ...(error.details ? { details: error.details } : {})
  };
}

module.exports = {
  serializeCapabilities,
  serializeOverview,
  serializePaginationMeta,
  serializeError
};
