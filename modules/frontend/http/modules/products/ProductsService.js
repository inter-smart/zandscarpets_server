const { QueryTypes } = require("sequelize");
const { models, sequelize } = require("../../../../../database/models");
const { singleMediaWithoutType } = require("../../traits/mediaButtonHelper");
const { withVisibility, stripHtml, articleRichText } = require("../../traits/sectionHelpers");
const { HttpError } = require("../../traits/HttpError");
const { toPublicFields } = require("../../traits/detailFieldsPublic");
const { resolveVariantDetails, resolveProductDetails } = require("../../../../../services/detailsResolverService");
const MetaTagService = require("../metaTag/MetaTagService");

const DEFAULT_LIMIT = 6;
// the storefront can ask for the first N pages at once (a `?page=N` link)
const MAX_LIMIT = 120;

const text = (value) => value ?? "";

const SLUG = /^[a-z0-9-]+$/i;
const MAX_FILTER_VALUES = 40;

// "a,b,c" -> ["a","b","c"] (plain slugs only)
const parseList = (value) =>
  (typeof value === "string" ? value.split(",") : [])
    .map((item) => item.trim())
    .filter((item) => SLUG.test(item))
    .slice(0, MAX_FILTER_VALUES);

// "color:oak,color:grey,size:2m" -> [["color", ["oak","grey"]], ["size", ["2m"]]]
const parseAttributes = (value) => {
  const groups = new Map();
  for (const pair of (typeof value === "string" ? value.split(",") : []).slice(0, MAX_FILTER_VALUES)) {
    const [attribute, valueSlug, ...rest] = pair.trim().split(":");
    if (rest.length || !SLUG.test(attribute ?? "") || !SLUG.test(valueSlug ?? "")) continue;
    if (!groups.has(attribute)) groups.set(attribute, new Set());
    groups.get(attribute).add(valueSlug);
  }
  return [...groups].map(([attribute, values]) => [attribute, [...values]]);
};

const toPositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

// SQL: "variant `v` has, for attribute #index, one of the chosen values". Uses the replacements
// `attr{index}` (attribute slug) and `vals{index}` (value slugs).
const variantHasChosenValue = (index) => `EXISTS (
  SELECT 1
  FROM variant_attribute_values vav${index}
  JOIN attribute_values av${index}
    ON av${index}.id = vav${index}.attribute_value_id AND av${index}.is_active = true AND av${index}.deleted_at IS NULL
  JOIN attributes a${index}
    ON a${index}.id = av${index}.attribute_id AND a${index}.is_active = true AND a${index}.deleted_at IS NULL
  WHERE vav${index}.variant_id = v.id
    AND a${index}.slug = :attr${index}
    AND av${index}.slug IN (:vals${index})
)`;

// SQL: "product `p` carries one of the chosen tags". Uses the replacement `tagSlugs`.
const PRODUCT_HAS_CHOSEN_TAG = `EXISTS (
  SELECT 1
  FROM product_label_map plm
  JOIN product_labels tl
    ON tl.id = plm.label_id AND tl.type = 'tag' AND tl.is_active = true AND tl.deleted_at IS NULL
  WHERE plm.product_id = p.id
    AND tl.slug IN (:tagSlugs)
)`;

const setGroupReplacements =(replacements, groups) =>
  groups.forEach(([attributeSlug, valueSlugs], index) => {
    replacements[`attr${index}`] = attributeSlug;
    replacements[`vals${index}`] = valueSlugs;
  });

// Auto-fills attributes that have no real alternative given what's already chosen: if exactly one
// value of an unpicked attribute still appears on a variant matching the current choices, that
// value is picked too. Runs until nothing more can be resolved this way (picking one attribute can
// narrow another the same way, e.g. Colour -> Size -> Material). Never guesses between two or more
// still-possible values.
const narrowChosen = (variants, attributeSlugs, initialChosen) => {
  const chosen = { ...initialChosen };
  const matches = (variant) => Object.entries(chosen).every(([slug, value]) => variant.values[slug] === value);

  let changed = true;
  while (changed) {
    changed = false;
    for (const slug of attributeSlugs) {
      if (chosen[slug]) continue;
      const possible = new Set(variants.filter(matches).map((variant) => variant.values[slug]).filter(Boolean));
      if (possible.size === 1) {
        chosen[slug] = [...possible][0];
        changed = true;
      }
    }
  }
  return chosen;
};

const CARD_COLUMNS = `
        p.id,
        p.slug,
        p.title,
        p.title_ar,
        p.short_description,
        p.short_description_ar,
        p.list_media_path,
        p.list_media_alt,
        p.list_media_alt_ar,
        c.slug AS category_slug,
        c.title AS category_title,
        c.title_ar AS category_title_ar,
        b.slug AS badge_slug,
        b.title AS badge_title,
        b.title_ar AS badge_title_ar`;

const CARD_JOINS = `
      JOIN product_categories c ON c.id = p.product_category_id AND c.is_active = true AND c.deleted_at IS NULL
      LEFT JOIN product_labels b ON b.id = p.badge_label_id AND b.is_active = true AND b.deleted_at IS NULL`;

// One product card (listing + related carousel)
const toCard = (row) => ({
  id: row.id,
  slug: text(row.slug),
  title: text(row.title),
  title_ar: text(row.title_ar),
  // the card shows plain text
  description: stripHtml(row.short_description),
  description_ar: stripHtml(row.short_description_ar),
  media: singleMediaWithoutType(row, "list_media_path", "list_media_alt", "list_media_alt_ar"),
  // a disabled badge is not shown (the product itself stays listed)
  badge: row.badge_slug
    ? { slug: row.badge_slug, title: text(row.badge_title), title_ar: text(row.badge_title_ar) }
    : null,
  category: {
    slug: row.category_slug,
    title: text(row.category_title),
    title_ar: text(row.category_title_ar),
  },
});

const toOption = (row) => ({ slug: row.slug, title: text(row.title), title_ar: text(row.title_ar) });

// Same convention as the home / about APIs: every text field comes back in both languages
// (`title` / `title_ar`) and the storefront picks one by locale.
class ProductsService {
  // Page-level content: banner (the banner linked to the `products` page), the page's JSON-LD /
  // extra scripts and the general FAQs (the ones that don't belong to a product; the heading
  // is the home page's FAQ title).
  static async page() {
    const [banner = [], otherMeta, faqs = [], homeCms] = await Promise.all([
      models.Banners.findAll({
        include: [
          {
            model: models.Page,
            as: "page",
            required: true,
            attributes: [],
            where: { is_active: true, page_slug: "products" },
          },
        ],
      }),
      MetaTagService.getOtherMetaForPage("products"),
      models.Faqs.findAll({
        attributes: ["id", "question", "question_ar", "answer", "answer_ar", "sort_order"],
        where: { is_active: true, product_id: null },
        order: [["sort_order", "ASC"], ["id", "ASC"]],
      }),
      models.HomeCms.findOne({ attributes: ["faq_title", "faq_title_ar"] }),
    ]);

    const bannerSection = {
      title: text(banner[0]?.title),
      title_ar: text(banner[0]?.title_ar),
      sub_title: text(banner[0]?.sub_title),
      sub_title_ar: text(banner[0]?.sub_title_ar),
      media: singleMediaWithoutType(banner[0], "media_path", "media_alt", "media_alt_ar"),
    };

    const faqsSection = {
      title: text(homeCms?.faq_title),
      title_ar: text(homeCms?.faq_title_ar),
      list: faqs.map((item) => ({
        id: item.id,
        question: text(item.question),
        question_ar: text(item.question_ar),
        answer: text(item.answer),
        answer_ar: text(item.answer_ar),
      })),
    };

    return {
      data: {
        other_meta: otherMeta.other_meta,
        other_meta_ar: otherMeta.other_meta_ar,
        banner_section: withVisibility(bannerSection),
        faqs_section: withVisibility(faqsSection),
      },
    };
  }

  // Filter options for the products page: only what the UI renders.
  //  - categories: a flat list (the storefront builds the tree from `parent_slug`) of the top-level
  //    categories plus the sub-categories of the ones that are open: a selected category (`?category=`)
  //    and every ancestor of a selected category. Only categories with an active product in them
  //    or in a sub-category are included.
  //  - attributes: the values of the current result set (see attributeFacets)
  //  - tags: the tag labels flagged `show_in_filter` that are on at least one active product
  static async filters(req) {
    // slug '' never matches; it keeps the IN list non-empty when nothing is selected
    const selectedSlugs = parseList(req?.query?.category);
    const attributeGroups = parseAttributes(req?.query?.attrs);
    const tagSlugs = parseList(req?.query?.tag);

    const [categoryRows, valueRows, tagRows] = await Promise.all([
      sequelize.query(
        `
        WITH RECURSIVE used AS (
          SELECT c.id, c.parent_id
          FROM product_categories c
          WHERE c.is_active = true AND c.deleted_at IS NULL
            AND EXISTS (
              SELECT 1 FROM products p
              WHERE p.product_category_id = c.id AND p.is_active = true AND p.deleted_at IS NULL
            )
          UNION
          SELECT parent.id, parent.parent_id
          FROM product_categories parent
          JOIN used u ON u.parent_id = parent.id
          WHERE parent.is_active = true AND parent.deleted_at IS NULL
        ),
        open_categories AS (
          SELECT s.id, s.parent_id
          FROM product_categories s
          WHERE s.slug IN (:selectedSlugs) AND s.is_active = true AND s.deleted_at IS NULL
          UNION
          SELECT parent.id, parent.parent_id
          FROM product_categories parent
          JOIN open_categories o ON o.parent_id = parent.id
          WHERE parent.is_active = true AND parent.deleted_at IS NULL
        )
        SELECT c.slug, c.title, c.title_ar, par.slug AS parent_slug
        FROM product_categories c
        JOIN used ON used.id = c.id
        LEFT JOIN product_categories par
          ON par.id = c.parent_id AND par.is_active = true AND par.deleted_at IS NULL
        WHERE c.slug IS NOT NULL
          AND (par.id IS NULL OR par.id IN (SELECT id FROM open_categories))
        ORDER BY c.sort_order ASC, c.id ASC`,
        {
          replacements: { selectedSlugs: selectedSlugs.length ? selectedSlugs : [""] },
          type: QueryTypes.SELECT,
        },
      ),
      this.attributeFacets(selectedSlugs, attributeGroups, tagSlugs),
      sequelize.query(
        `
        SELECT l.slug, l.title, l.title_ar
        FROM product_labels l
        WHERE l.type = 'tag' AND l.show_in_filter = true AND l.is_active = true AND l.deleted_at IS NULL
          AND l.slug IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM product_label_map plm
            JOIN products p ON p.id = plm.product_id AND p.is_active = true AND p.deleted_at IS NULL
            JOIN product_categories pc
              ON pc.id = p.product_category_id AND pc.is_active = true AND pc.deleted_at IS NULL
            WHERE plm.label_id = l.id
          )
        ORDER BY l.sort_order ASC, l.id ASC`,
        { type: QueryTypes.SELECT },
      ),
    ]);

    const attributes = new Map();
    for (const row of valueRows) {
      if (!attributes.has(row.attribute_slug)) {
        attributes.set(row.attribute_slug, {
          slug: row.attribute_slug,
          title: text(row.attribute_title),
          title_ar: text(row.attribute_title_ar),
          values: [],
        });
      }
      attributes.get(row.attribute_slug).values.push({
        slug: row.value_slug,
        value: text(row.value),
        value_ar: text(row.value_ar),
      });
    }

    return {
      data: {
        categories: categoryRows.map((row) => ({
          slug: row.slug,
          title: text(row.title),
          title_ar: text(row.title_ar),
          parent_slug: row.parent_slug ?? null,
        })),
        attributes: [...attributes.values()],
        tags: tagRows.map(toOption),
      },
    };
  }

  // Attribute values for the filter panel, following the current result set (faceted filtering).
  // For each attribute, a value is offered when some active product, within the selected
  // categories, has an active variant with that value which also satisfies the chosen values of
  // the OTHER attributes (the attribute's own choice is left out, so you can still add
  // alternatives in the same group), and carries one of the chosen tags. Values the visitor
  // already chose are always kept, even when nothing matches any more.
  static async attributeFacets(categorySlugs, attributeGroups, tagSlugs = []) {
    const replacements = {};
    setGroupReplacements(replacements, attributeGroups);

    const conditions = ["a.is_active = true", "a.deleted_at IS NULL", "a.slug IS NOT NULL", "av.slug IS NOT NULL"];
    if (categorySlugs.length) {
      conditions.push(
        "p.product_category_id IN (SELECT id FROM product_categories WHERE slug IN (:categorySlugs) AND is_active = true AND deleted_at IS NULL)",
      );
      replacements.categorySlugs = categorySlugs;
    }
    if (tagSlugs.length) {
      conditions.push(PRODUCT_HAS_CHOSEN_TAG);
      replacements.tagSlugs = tagSlugs;
    }
    attributeGroups.forEach((_, index) =>
      conditions.push(`(a.slug = :attr${index} OR ${variantHasChosenValue(index)})`),
    );

    const facetSql = `
      SELECT a.slug AS attribute_slug, a.title AS attribute_title, a.title_ar AS attribute_title_ar,
             av.slug AS value_slug, av.value, av.value_ar,
             COUNT(DISTINCT p.id)::int AS product_count,
             a.sort_order AS a_sort, a.id AS a_id, av.sort_order AS v_sort, av.id AS v_id
      FROM attributes a
      JOIN attribute_values av
        ON av.attribute_id = a.id AND av.is_active = true AND av.deleted_at IS NULL
      JOIN variant_attribute_values vav ON vav.attribute_value_id = av.id
      JOIN product_variants v ON v.id = vav.variant_id AND v.is_active = true AND v.deleted_at IS NULL
      JOIN products p ON p.id = v.product_id AND p.is_active = true AND p.deleted_at IS NULL
      JOIN product_categories pc
        ON pc.id = p.product_category_id AND pc.is_active = true AND pc.deleted_at IS NULL
      WHERE ${conditions.join("\n        AND ")}
      GROUP BY a.id, a.slug, a.title, a.title_ar, a.sort_order, av.id, av.slug, av.value, av.value_ar, av.sort_order
      ORDER BY a.sort_order ASC, a.id ASC, av.sort_order ASC, av.id ASC`;

    const rows = await sequelize.query(facetSql, { replacements, type: QueryTypes.SELECT });
    if (!attributeGroups.length) return rows;

    // keep the chosen values even when they no longer match anything
    const present = new Set(rows.map((row) => `${row.attribute_slug}:${row.value_slug}`));
    const chosenReplacements = {};
    const chosenConditions = attributeGroups.map(([attributeSlug, valueSlugs], index) => {
      chosenReplacements[`cAttr${index}`] = attributeSlug;
      chosenReplacements[`cVals${index}`] = valueSlugs;
      return `(a.slug = :cAttr${index} AND av.slug IN (:cVals${index}))`;
    });
    const chosenRows = await sequelize.query(
      `
      SELECT a.slug AS attribute_slug, a.title AS attribute_title, a.title_ar AS attribute_title_ar,
             av.slug AS value_slug, av.value, av.value_ar, 0 AS product_count,
             a.sort_order AS a_sort, a.id AS a_id, av.sort_order AS v_sort, av.id AS v_id
      FROM attributes a
      JOIN attribute_values av
        ON av.attribute_id = a.id AND av.is_active = true AND av.deleted_at IS NULL
      WHERE a.is_active = true AND a.deleted_at IS NULL
        AND (${chosenConditions.join(" OR ")})`,
      { replacements: chosenReplacements, type: QueryTypes.SELECT },
    );

    return [...rows, ...chosenRows.filter((row) => !present.has(`${row.attribute_slug}:${row.value_slug}`))].sort(
      (a, b) => a.a_sort - b.a_sort || a.a_id - b.a_id || a.v_sort - b.v_sort || a.v_id - b.v_id,
    );
  }

  // Paginated list of active products (whose category is active). Filters (all optional):
  //  - `?category=a,b`: category slugs; only the products of those categories themselves (a
  //    sub-category's products come with it when it is selected too)
  //  - `?attrs=color:oak,color:grey,size:2m`: attribute:value slugs. A product matches when one of
  //    its active variants has, for every attribute given, one of the chosen values.
  //  - `?tag=a,b`: tag label slugs; a product matches when it carries any of them
  // Raw SQL: one query for the page, one for the total.
  static async list(req) {
    const page = toPositiveInt(req?.query?.page, 1);
    const limit = Math.min(toPositiveInt(req?.query?.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const categorySlugs = parseList(req?.query?.category);
    const attributeGroups = parseAttributes(req?.query?.attrs);
    const tagSlugs = parseList(req?.query?.tag);

    const where = ["p.deleted_at IS NULL", "p.is_active = true"];
    const replacements = { limit, offset: (page - 1) * limit };

    if (tagSlugs.length) {
      where.push(PRODUCT_HAS_CHOSEN_TAG);
      replacements.tagSlugs = tagSlugs;
    }

    if (categorySlugs.length) {
      // an unknown / disabled category matches nothing
      where.push(
        "p.product_category_id IN (SELECT id FROM product_categories WHERE slug IN (:categorySlugs) AND is_active = true AND deleted_at IS NULL)",
      );
      replacements.categorySlugs = categorySlugs;
    }

    if (attributeGroups.length) {
      setGroupReplacements(replacements, attributeGroups);
      where.push(`EXISTS (
        SELECT 1 FROM product_variants v
        WHERE v.product_id = p.id AND v.is_active = true AND v.deleted_at IS NULL
          AND ${attributeGroups.map((_, index) => variantHasChosenValue(index)).join("\n          AND ")}
      )`);
    }

    const fromClause = `
      FROM products p
      ${CARD_JOINS}
      WHERE ${where.join(" AND ")}`;

    const dataSql = `
      SELECT ${CARD_COLUMNS}
      ${fromClause}
      ORDER BY p.sort_order ASC, p.id ASC
      LIMIT :limit OFFSET :offset`;

    const countSql = `
      SELECT COUNT(*)::int AS count
      ${fromClause}`;

    const [rows, countRows] = await Promise.all([
      sequelize.query(dataSql, { replacements, type: QueryTypes.SELECT }),
      sequelize.query(countSql, { replacements, type: QueryTypes.SELECT }),
    ]);

    const products = rows.map(toCard);

    const count = countRows[0]?.count ?? 0;
    const totalPages = Math.max(Math.ceil(count / limit), 1);
    return {
      data: {
        products,
        pagination: { page, limit, totalCount: count, totalPages, hasMore: page < totalPages },
      },
    };
  }

  // One active product with everything the detail page renders. `?attrs=size:small,color:oak`
  // picks the variant when it names a value for every attribute of the product and such a variant
  // exists; anything else selects no variant, never an error. Tab content (`details`) is resolved for the
  // selected variant with the usual override rules, or for the product itself when none is selected.
  static async detail(req) {
    const slug = String(req?.params?.slug ?? "");
    if (!SLUG.test(slug)) throw new HttpError("Product not found", 404, "NOT_FOUND");

    const [product] = await sequelize.query(
      `SELECT
         p.id, p.slug, p.title, p.title_ar, p.short_description, p.short_description_ar,
         p.product_description, p.product_description_ar,
         p.main_media_path, p.media_alt, p.media_alt_ar,
         p.product_category_id,
         b.slug AS badge_slug, b.title AS badge_title, b.title_ar AS badge_title_ar
       FROM products p
       JOIN product_categories c ON c.id = p.product_category_id AND c.is_active = true AND c.deleted_at IS NULL
       LEFT JOIN product_labels b ON b.id = p.badge_label_id AND b.is_active = true AND b.deleted_at IS NULL
       WHERE p.slug = :slug AND p.is_active = true AND p.deleted_at IS NULL
       LIMIT 1`,
      { replacements: { slug }, type: QueryTypes.SELECT },
    );
    if (!product) throw new HttpError("Product not found", 404, "NOT_FOUND");

    const id = product.id;
    const [categoryChain, labelRows, variantRows, attributeRows, faqRows] = await Promise.all([
      // the category and its ancestors (breadcrumb)
      sequelize.query(
        `WITH RECURSIVE chain AS (
           SELECT id, parent_id, slug, title, title_ar, 0 AS depth
           FROM product_categories WHERE id = :categoryId
           UNION ALL
           SELECT c.id, c.parent_id, c.slug, c.title, c.title_ar, chain.depth + 1
           FROM product_categories c JOIN chain ON c.id = chain.parent_id
           WHERE c.deleted_at IS NULL
         )
         SELECT slug, title, title_ar FROM chain ORDER BY depth DESC`,
        { replacements: { categoryId: product.product_category_id }, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT l.type, l.slug, l.title, l.title_ar
         FROM product_label_map m
         JOIN product_labels l ON l.id = m.label_id AND l.is_active = true AND l.deleted_at IS NULL
         WHERE m.product_id = :id
         ORDER BY l.sort_order ASC, l.id ASC`,
        { replacements: { id }, type: QueryTypes.SELECT },
      ),
      // one row per (variant, attribute value)
      sequelize.query(
        `SELECT v.id, v.label, v.label_ar, v.sku, v.media_path, v.media_alt, v.media_alt_ar,
                a.slug AS attribute_slug, av.slug AS value_slug
         FROM product_variants v
         LEFT JOIN variant_attribute_values vav ON vav.variant_id = v.id
         LEFT JOIN attribute_values av ON av.id = vav.attribute_value_id AND av.is_active = true AND av.deleted_at IS NULL
         LEFT JOIN attributes a ON a.id = av.attribute_id AND a.is_active = true AND a.deleted_at IS NULL
         WHERE v.product_id = :id AND v.is_active = true AND v.deleted_at IS NULL
         ORDER BY v.sort_order ASC, v.id ASC`,
        { replacements: { id }, type: QueryTypes.SELECT },
      ),
      // attributes of the product with only the values an active variant uses
      sequelize.query(
        `SELECT DISTINCT
                pa.sort_order AS attribute_order, a.id AS attribute_id, a.slug AS attribute_slug,
                a.title AS attribute_title, a.title_ar AS attribute_title_ar, a.type AS attribute_type,
                av.id AS value_id, av.slug AS value_slug, av.value, av.value_ar, av.color_code,
                av.media_path, av.media_alt, av.media_alt_ar, av.sort_order AS value_order
         FROM product_attributes pa
         JOIN attributes a ON a.id = pa.attribute_id AND a.is_active = true AND a.deleted_at IS NULL
         JOIN attribute_values av ON av.attribute_id = a.id AND av.is_active = true AND av.deleted_at IS NULL
         JOIN variant_attribute_values vav ON vav.attribute_value_id = av.id
         JOIN product_variants v ON v.id = vav.variant_id AND v.product_id = :id AND v.is_active = true AND v.deleted_at IS NULL
         WHERE pa.product_id = :id
         ORDER BY pa.sort_order ASC, a.id ASC, av.sort_order ASC, av.id ASC`,
        { replacements: { id }, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT id, question, question_ar, answer, answer_ar
         FROM faqs
         WHERE is_active = true AND deleted_at IS NULL AND product_id = :id
         ORDER BY sort_order ASC, id ASC`,
        { replacements: { id }, type: QueryTypes.SELECT },
      ),
    ]);

    // variants: id -> { ..., values: { attributeSlug: valueSlug } }
    const variantMap = new Map();
    for (const row of variantRows) {
      if (!variantMap.has(row.id)) {
        variantMap.set(row.id, {
          id: row.id,
          sku: text(row.sku),
          label: text(row.label),
          label_ar: text(row.label_ar),
          media: singleMediaWithoutType(row, "media_path", "media_alt", "media_alt_ar"),
          values: {},
        });
      }
      if (row.attribute_slug && row.value_slug) variantMap.get(row.id).values[row.attribute_slug] = row.value_slug;
    }
    const variants = [...variantMap.values()];

    // A variant is selected only when the chosen values pick exactly one: every attribute of the
    // product has a chosen value and some variant has all of them. An attribute left unpicked is
    // auto-filled when, given what IS picked, only one of its values is still possible (e.g. the
    // product only has one Material, or picking a Colour leaves only one Size in stock) — this is
    // run to a fixed point, since filling one attribute can narrow another the same way. A genuine
    // choice between two or more values is never auto-made; the page then shows product-level
    // content until the visitor picks.
    const rawChosen = Object.fromEntries(parseAttributes(req?.query?.attrs).map(([attribute, values]) => [attribute, values[0]]));
    const attributeSlugs = [...new Set(attributeRows.map((row) => row.attribute_slug))];
    const chosen = narrowChosen(variants, attributeSlugs, rawChosen);
    const selected =
      attributeSlugs.length > 0 && attributeSlugs.every((slug) => chosen[slug])
        ? (variants.find((variant) => attributeSlugs.every((slug) => variant.values[slug] === chosen[slug])) ?? null)
        : null;

    const attributes = [];
    for (const row of attributeRows) {
      let attribute = attributes.find((item) => item.slug === row.attribute_slug);
      if (!attribute) {
        attribute = {
          slug: row.attribute_slug,
          title: text(row.attribute_title),
          title_ar: text(row.attribute_title_ar),
          type: row.attribute_type,
          values: [],
        };
        attributes.push(attribute);
      }
      attribute.values.push({
        slug: row.value_slug,
        value: text(row.value),
        value_ar: text(row.value_ar),
        color_code: text(row.color_code),
        media: singleMediaWithoutType(row, "media_path", "media_alt", "media_alt_ar"),
      });
    }

    const resolved = selected
      ? await resolveVariantDetails({ productId: id, variantId: selected.id })
      : await resolveProductDetails({ productId: id });

    // only the product's own FAQs (the page hides the section when there are none)
    const faqTitle = faqRows.length
      ? await models.HomeCms.findOne({ attributes: ["faq_title", "faq_title_ar"], raw: true })
      : null;

    const labelsOfType = (type) => labelRows.filter((row) => row.type === type).map(toOption);

    return {
      data: {
        product: {
          id,
          slug: product.slug,
          title: text(product.title),
          title_ar: text(product.title_ar),
          short_description: stripHtml(product.short_description),
          short_description_ar: stripHtml(product.short_description_ar),
          description: articleRichText(product.product_description),
          description_ar: articleRichText(product.product_description_ar),
          media: singleMediaWithoutType(product, "main_media_path", "media_alt", "media_alt_ar"),
          badge: product.badge_slug
            ? { slug: product.badge_slug, title: text(product.badge_title), title_ar: text(product.badge_title_ar) }
            : null,
          categories: categoryChain.map(toOption),
          features: labelsOfType("feature"),
          tags: labelsOfType("tag"),
          specifications: labelsOfType("specification"),
        },
        attributes,
        variants,
        selected_variant_id: selected?.id ?? null,
        details: toPublicFields(resolved),
        faqs_section: {
          title: text(faqTitle?.faq_title),
          title_ar: text(faqTitle?.faq_title_ar),
          list: faqRows.map((item) => ({
            id: item.id,
            question: text(item.question),
            question_ar: text(item.question_ar),
            answer: text(item.answer),
            answer_ar: text(item.answer_ar),
          })),
        },
      },
    };
  }

  // Active products picked in the admin as related, for the "related" carousel. No fallback: with
  // no picks the list is empty and the storefront hides the section.
  static async related(req) {
    const slug = String(req?.params?.slug ?? "");
    const limit = Math.min(toPositiveInt(req?.query?.limit, 8), 16);
    if (!SLUG.test(slug)) throw new HttpError("Product not found", 404, "NOT_FOUND");

    const [current] = await sequelize.query(
      `SELECT id, product_category_id FROM products
       WHERE slug = :slug AND is_active = true AND deleted_at IS NULL LIMIT 1`,
      { replacements: { slug }, type: QueryTypes.SELECT },
    );
    if (!current) throw new HttpError("Product not found", 404, "NOT_FOUND");

    const rows = await sequelize.query(
      `SELECT ${CARD_COLUMNS}
       FROM products p
       ${CARD_JOINS}
       WHERE p.deleted_at IS NULL AND p.is_active = true AND p.id <> :id
         AND EXISTS (SELECT 1 FROM product_related_products r WHERE r.product_id = :id AND r.related_product_id = p.id)
       ORDER BY p.sort_order ASC, p.id ASC
       LIMIT :limit`,
      { replacements: { id: current.id, limit }, type: QueryTypes.SELECT },
    );

    return { data: { products: rows.map(toCard) } };
  }
}

module.exports = ProductsService;
