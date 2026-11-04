const { QueryTypes } = require("sequelize");
const { models, sequelize } = require("../../../../../database/models");
const { singleMediaWithoutType } = require("../../traits/mediaButtonHelper");
const { withVisibility, articleRichText } = require("../../traits/sectionHelpers");
const { HttpError } = require("../../traits/HttpError");
const MetaTagService = require("../metaTag/MetaTagService");

const DEFAULT_LIMIT = 6;
// the storefront can ask for the first N pages at once (a `?page=N` link)
const MAX_LIMIT = 120;
const MAX_FILTER_VALUES = 40;
const SLUG = /^[a-z0-9-]+$/i;

const text = (value) => value ?? "";

const toPositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

// "a,b,c" -> ["a","b","c"] (plain slugs only)
const parseList = (value) =>
  (typeof value === "string" ? value.split(",") : [])
    .map((item) => item.trim())
    .filter((item) => SLUG.test(item))
    .slice(0, MAX_FILTER_VALUES);

// A post is public when it is switched on and its publish date has come
const PUBLISHED = "b.deleted_at IS NULL AND b.is_active = true AND b.published_at <= now()";

const toMedia = (row, pathKey = "media_path", altKey = "media_alt", altArKey = "media_alt_ar") =>
  singleMediaWithoutType(row, pathKey, altKey, altArKey);

const toCard = (row) => ({
  slug: row.slug,
  title: text(row.title),
  title_ar: text(row.title_ar),
  excerpt: text(row.excerpt),
  excerpt_ar: text(row.excerpt_ar),
  author: text(row.author_name),
  author_ar: text(row.author_name_ar),
  published_at: row.published_at,
  media: toMedia(row),
});

const CARD_COLUMNS = `
  b.slug, b.title, b.title_ar, b.excerpt, b.excerpt_ar, b.author_name, b.author_name_ar,
  b.published_at, b.media_path, b.media_alt, b.media_alt_ar`;

// Same convention as the home / about APIs: every text field comes back in both languages
// (`title` / `title_ar`) and the storefront picks one by locale.
class BlogsService {
  // Page-level content: banner (the banner linked to the `blogs` page), the page's JSON-LD / extra
  // scripts, the headings, the filter options (only categories and tags that published posts use)
  // and all active ad banners.
  static async page() {
    const [banner = [], otherMeta, cms, categoryRows, tagRows, ads = []] = await Promise.all([
      models.Banners.findAll({
        include: [
          {
            model: models.Page,
            as: "page",
            required: true,
            attributes: [],
            where: { is_active: true, page_slug: "blogs" },
          },
        ],
      }),
      MetaTagService.getOtherMetaForPage("blogs"),
      models.BlogCms.findOne({ attributes: ["title", "title_ar", "related_title", "related_title_ar"] }),
      sequelize.query(
        `
        SELECT c.slug, c.title, c.title_ar
        FROM product_categories c
        WHERE c.is_active = true AND c.deleted_at IS NULL AND c.slug IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM blog_category_map bc
            JOIN blogs b ON b.id = bc.blog_id AND ${PUBLISHED}
            WHERE bc.category_id = c.id
          )
        ORDER BY c.sort_order ASC, c.id ASC`,
        { type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `
        SELECT t.slug, t.title, t.title_ar
        FROM blog_tags t
        WHERE t.is_active = true AND t.deleted_at IS NULL AND t.slug IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM blog_tag_map bt
            JOIN blogs b ON b.id = bt.blog_id AND ${PUBLISHED}
            WHERE bt.tag_id = t.id
          )
        ORDER BY t.sort_order ASC, t.id ASC`,
        { type: QueryTypes.SELECT },
      ),
      models.AdsBanner.findAll({
        where: { is_active: true },
        attributes: ["id", "media_path", "mobile_media_path", "media_alt", "media_alt_ar", "link", "link_new_tab", "button_text", "button_text_ar"],
        order: [["sort_order", "ASC"], ["id", "ASC"]],
      }),
    ]);

    const bannerSection = {
      title: text(banner[0]?.title),
      title_ar: text(banner[0]?.title_ar),
      sub_title: text(banner[0]?.sub_title),
      sub_title_ar: text(banner[0]?.sub_title_ar),
      media: toMedia(banner[0] ?? {}),
    };

    const toOption = (row) => ({ slug: row.slug, title: text(row.title), title_ar: text(row.title_ar) });

    return {
      data: {
        other_meta: otherMeta.other_meta,
        other_meta_ar: otherMeta.other_meta_ar,
        banner_section: withVisibility(bannerSection),
        list_section: {
          title: text(cms?.title),
          title_ar: text(cms?.title_ar),
          related_title: text(cms?.related_title),
          related_title_ar: text(cms?.related_title_ar),
        },
        filters: { categories: categoryRows.map(toOption), tags: tagRows.map(toOption) },
        ads: ads
          .filter((item) => item.media_path)
          .map((item) => ({
            id: item.id,
            media: toMedia(item),
            mobile_media: item.mobile_media_path ? toMedia(item, "mobile_media_path") : null,
            link: text(item.link),
            new_tab: Boolean(item.link_new_tab),
            button_text: text(item.button_text),
            button_text_ar: text(item.button_text_ar),
          })),
      },
    };
  }

  // Paginated list of published posts. Filters (all optional): `?category=a,b` (product category
  // slugs), `?tag=x,y` (tag slugs), `?sort=latest|oldest`. Several values of one filter mean "any
  // of these"; the two filters are combined with AND. Raw SQL, card columns only (no body).
  static async list(req) {
    const page = toPositiveInt(req?.query?.page, 1);
    const limit = Math.min(toPositiveInt(req?.query?.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const categorySlugs = parseList(req?.query?.category);
    const tagSlugs = parseList(req?.query?.tag);
    const oldestFirst = req?.query?.sort === "oldest";

    const where = [PUBLISHED];
    const replacements = { limit, offset: (page - 1) * limit };

    if (categorySlugs.length) {
      where.push(`EXISTS (
        SELECT 1 FROM blog_category_map bc
        JOIN product_categories c ON c.id = bc.category_id AND c.is_active = true AND c.deleted_at IS NULL
        WHERE bc.blog_id = b.id AND c.slug IN (:categorySlugs)
      )`);
      replacements.categorySlugs = categorySlugs;
    }
    if (tagSlugs.length) {
      where.push(`EXISTS (
        SELECT 1 FROM blog_tag_map bt
        JOIN blog_tags t ON t.id = bt.tag_id AND t.is_active = true AND t.deleted_at IS NULL
        WHERE bt.blog_id = b.id AND t.slug IN (:tagSlugs)
      )`);
      replacements.tagSlugs = tagSlugs;
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const direction = oldestFirst ? "ASC" : "DESC";

    const [rows, countRows] = await Promise.all([
      sequelize.query(
        `SELECT ${CARD_COLUMNS}
         FROM blogs b
         ${whereSql}
         ORDER BY b.published_at ${direction}, b.id ${direction}
         LIMIT :limit OFFSET :offset`,
        { replacements, type: QueryTypes.SELECT },
      ),
      sequelize.query(`SELECT COUNT(*)::int AS count FROM blogs b ${whereSql}`, {
        replacements,
        type: QueryTypes.SELECT,
      }),
    ]);

    const count = countRows[0]?.count ?? 0;
    const totalPages = Math.max(Math.ceil(count / limit), 1);
    return {
      data: {
        blogs: rows.map(toCard),
        pagination: { page, limit, totalCount: count, totalPages, hasMore: page < totalPages },
      },
    };
  }

  // One published post with everything the page renders
  static async detail(req) {
    const slug = String(req?.params?.slug ?? "");
    if (!SLUG.test(slug)) throw new HttpError("Blog not found", 404, "NOT_FOUND");

    const [post] = await sequelize.query(
      `SELECT b.id, ${CARD_COLUMNS}, b.content, b.content_ar, b."updatedAt" AS updated_at
       FROM blogs b
       WHERE ${PUBLISHED} AND b.slug = :slug
       LIMIT 1`,
      { replacements: { slug }, type: QueryTypes.SELECT },
    );
    if (!post) throw new HttpError("Blog not found", 404, "NOT_FOUND");

    const [images, tags, categories] = await Promise.all([
      sequelize.query(
        `SELECT media_path, media_alt, media_alt_ar
         FROM blog_images
         WHERE blog_id = :id AND deleted_at IS NULL
         ORDER BY sort_order ASC, id ASC`,
        { replacements: { id: post.id }, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT t.slug, t.title, t.title_ar
         FROM blog_tag_map bt
         JOIN blog_tags t ON t.id = bt.tag_id AND t.is_active = true AND t.deleted_at IS NULL
         WHERE bt.blog_id = :id
         ORDER BY t.sort_order ASC, t.id ASC`,
        { replacements: { id: post.id }, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT c.slug, c.title, c.title_ar
         FROM blog_category_map bc
         JOIN product_categories c ON c.id = bc.category_id AND c.is_active = true AND c.deleted_at IS NULL
         WHERE bc.blog_id = :id
         ORDER BY c.sort_order ASC, c.id ASC`,
        { replacements: { id: post.id }, type: QueryTypes.SELECT },
      ),
    ]);

    const toOption = (row) => ({ slug: row.slug, title: text(row.title), title_ar: text(row.title_ar) });

    return {
      data: {
        ...toCard(post),
        content: articleRichText(post.content),
        content_ar: articleRichText(post.content_ar),
        updated_at: post.updated_at,
        images: images.map((row) => toMedia(row)),
        tags: tags.map(toOption),
        categories: categories.map(toOption),
      },
    };
  }

  // Published posts the admin picked by hand for the "related" carousel, in their order. No
  // fallback: a post with nothing picked returns an empty list
  static async related(req) {
    const slug = String(req?.params?.slug ?? "");
    const limit = Math.min(toPositiveInt(req?.query?.limit, 6), 12);
    if (!SLUG.test(slug)) throw new HttpError("Blog not found", 404, "NOT_FOUND");

    const [current] = await sequelize.query(
      `SELECT b.id FROM blogs b WHERE ${PUBLISHED} AND b.slug = :slug LIMIT 1`,
      { replacements: { slug }, type: QueryTypes.SELECT },
    );
    if (!current) throw new HttpError("Blog not found", 404, "NOT_FOUND");

    const rows = await sequelize.query(
      `SELECT ${CARD_COLUMNS}, r.sort_order AS related_sort_order
       FROM blogs b
       JOIN blog_related_map r ON r.related_blog_id = b.id AND r.blog_id = :id
       WHERE ${PUBLISHED} AND b.id <> :id
       ORDER BY r.sort_order ASC, b.id ASC
       LIMIT :limit`,
      { replacements: { id: current.id, limit }, type: QueryTypes.SELECT },
    );

    return { data: { blogs: rows.map(toCard) } };
  }
}

module.exports = BlogsService;
