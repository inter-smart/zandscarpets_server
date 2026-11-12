const { Op } = require("sequelize");

const MAX_LIMIT = 50;

// Reads the optional paging params the "active" picker endpoints accept.
// Returns null when no `limit` is given so callers keep the legacy full-list response.
const parsePickerQuery = (query) => {
  const limit = parseInt(query.limit, 10);
  if (!Number.isInteger(limit) || limit <= 0) return null;
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const search = query.search ? String(query.search).trim() : "";
  return { limit: Math.min(limit, MAX_LIMIT), page, offset: (Math.min(limit, MAX_LIMIT)) * (page - 1), search };
};

// Case-insensitive "contains" on any of the given columns (LIKE wildcards escaped).
const searchCondition = (fields, search) => {
  if (!search) return null;
  const escaped = search.replace(/[\\%_]/g, "\\$&");
  return { [Op.or]: fields.map((field) => ({ [field]: { [Op.iLike]: `%${escaped}%` } })) };
};

const pickerPageResult = (rows, totalCount, { page, limit }) => ({
  data: rows,
  pagination: { totalCount, totalPages: Math.ceil(totalCount / limit), currentPage: page, limit },
});

module.exports = { parsePickerQuery, searchCondition, pickerPageResult };
