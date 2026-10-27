const { QueryTypes } = require("sequelize");
const { sequelize } = require("../../../../../database/models");
const { BASE_URL } = require("../../../../../constants");
const { stripHtml } = require("../../traits/sectionHelpers");
const { HttpError } = require("../../traits/HttpError");
const { ANCESTORS_ACTIVE } = require("../products/ProductsService");

const MIN_QUERY = 2;
const MAX_QUERY = 80;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 48;
const TYPES = ["all", "products", "categories", "blogs"];

const text = (value) => value ?? "";

const toPositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const thumb = (path) => (path ? `${BASE_URL}/${path}` : null);

// escape the LIKE wildcards so "50%" or "a_b" is searched literally (ILIKE's default escape is "\")
const escapeLike = (value) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

// 0 = title starts with the term, 1 = title contains it, 2 = only another field matches
const rank = (...titleColumns) => `CASE
  WHEN ${titleColumns.map((column) => `${column} ILIKE :prefix`).join(" OR ")} THEN 0
  WHEN ${titleColumns.map((column) => `${column} ILIKE :contains`).join(" OR ")} THEN 1
  ELSE 2 END`;

const matches = (...columns) => columns.map((column) => `${column} ILIKE :contains`).join(" OR ");

// Only what the overlay renders; `full` (the results page) adds the short text.
const SOURCES = {
  products: {
    from: (extra) => `
      FROM products p
      JOIN product_categories c ON c.id = p.product_category_id AND c.is_active = true AND c.deleted_at IS NULL
        AND ${ANCESTORS_ACTIVE("c")}
      WHERE p.deleted_at IS NULL AND p.is_active = true
        AND (${matches("p.title", "p.title_ar", ...extra)})`,
    columns: (full) => `p.slug, p.title, p.title_ar, p.list_media_path,
      c.title AS category_title, c.title_ar AS category_title_ar
      ${full ? ", p.short_description, p.short_description_ar" : ""}`,
    searchable: ["p.short_description", "p.short_description_ar"],
    order: `${rank("p.title", "p.title_ar")}, p.sort_order ASC, p.id ASC`,
    map: (row, full) => ({
      slug: text(row.slug),
      title: text(row.title),
      title_ar: text(row.title_ar),
      thumb: thumb(row.list_media_path),
      category_title: text(row.category_title),
      category_title_ar: text(row.category_title_ar),
      ...(full && {
        description: stripHtml(row.short_description),
        description_ar: stripHtml(row.short_description_ar),
      }),
    }),
  },
  categories: {
    from: () => `
      FROM product_categories c
      WHERE c.is_active = true AND c.deleted_at IS NULL AND ${ANCESTORS_ACTIVE("c")}
        AND (${matches("c.title", "c.title_ar")})`,
    columns: () => "c.slug, c.title, c.title_ar",
    searchable: [],
    order: `${rank("c.title", "c.title_ar")}, c.sort_order ASC, c.id ASC`,
    map: (row) => ({ slug: text(row.slug), title: text(row.title), title_ar: text(row.title_ar) }),
  },
  blogs: {
    from: (extra) => `
      FROM blogs b
      WHERE b.deleted_at IS NULL AND b.is_active = true AND b.published_at <= now()
        AND b.slug IS NOT NULL AND b.slug <> ''
        AND (${matches("b.title", "b.title_ar", ...extra)})`,
    columns: (full) => `b.slug, b.title, b.title_ar, b.media_path
      ${full ? ", b.excerpt, b.excerpt_ar, b.published_at" : ""}`,
    searchable: ["b.excerpt", "b.excerpt_ar"],
    order: `${rank("b.title", "b.title_ar")}, b.published_at DESC, b.id DESC`,
    map: (row, full) => ({
      slug: text(row.slug),
      title: text(row.title),
      title_ar: text(row.title_ar),
      thumb: thumb(row.media_path),
      ...(full && {
        excerpt: text(row.excerpt),
        excerpt_ar: text(row.excerpt_ar),
        published_at: row.published_at,
      }),
    }),
  },
};

const searchGroup = async (source, { replacements, limit, offset, full, includeBody }) => {
  const from = source.from(includeBody ? source.searchable : []);
  const [rows, countRows] = await Promise.all([
    sequelize.query(
      `SELECT ${source.columns(full)} ${from} ORDER BY ${source.order} LIMIT :limit OFFSET :offset`,
      { replacements: { ...replacements, limit, offset }, type: QueryTypes.SELECT },
    ),
    sequelize.query(`SELECT COUNT(*)::int AS count ${from}`, { replacements, type: QueryTypes.SELECT }),
  ]);
  return { items: rows.map((row) => source.map(row, full)), totalCount: countRows[0]?.count ?? 0 };
};

class SearchService {
  // `?q=` (2-80 chars), `?type=all|products|categories|blogs` (default all), `?limit=` (default 5),
  // `?page=` (for a single type), `?view=full` (adds the short text, used by the results page).
  // The overlay matches titles only; the results page (`view=full`) also matches the short text.
  static async search(req) {
    const query = String(req?.query?.q ?? "").replace(/\s+/g, " ").trim();
    if (query.length < MIN_QUERY || query.length > MAX_QUERY) {
      throw new HttpError(`q must be ${MIN_QUERY}-${MAX_QUERY} characters`, 400, "INVALID_QUERY");
    }

    const type = TYPES.includes(req?.query?.type) ? req.query.type : "all";
    const limit = Math.min(toPositiveInt(req?.query?.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const page = type === "all" ? 1 : toPositiveInt(req?.query?.page, 1);
    const full = req?.query?.view === "full";

    const escaped = escapeLike(query);
    const options = {
      replacements: { contains: `%${escaped}%`, prefix: `${escaped}%` },
      limit,
      offset: (page - 1) * limit,
      full,
      includeBody: full,
    };

    const names = type === "all" ? Object.keys(SOURCES) : [type];
    const results = await Promise.all(names.map((name) => searchGroup(SOURCES[name], options)));

    return { data: Object.fromEntries(names.map((name, index) => [name, results[index]])) };
  }
}

module.exports = SearchService;
