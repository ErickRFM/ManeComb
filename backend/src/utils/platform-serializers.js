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
  serializePaginationMeta,
  serializeError
};
