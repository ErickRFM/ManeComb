const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePagination(query, allowedSorts = []) {
  let page = parseInt(query.page, 10);
  if (isNaN(page) || page < 1) page = DEFAULT_PAGE;

  let limit = parseInt(query.limit, 10);
  if (isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  const skip = (page - 1) * limit;

  let sort = String(query.sort || "").trim();
  if (sort && allowedSorts.length && !allowedSorts.includes(sort)) {
    sort = allowedSorts[0];
  }
  if (!sort) sort = "createdAt";

  const order = String(query.order || "").trim().toLowerCase() === "asc" ? "asc" : "desc";

  return { page, limit, skip, sort, order };
}

function buildPaginationMeta(total, page, limit) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
}

module.exports = {
  parsePagination,
  buildPaginationMeta,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT
};
