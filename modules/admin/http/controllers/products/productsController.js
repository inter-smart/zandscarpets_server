const { Op, QueryTypes } = require("sequelize");
const { sequelize, models } = require("../../../../../database/models");
const { handleFileUploadUpdate, handleFileUploadStore, deleteOldFile } = require("../../middleware/multerMiddleware");
const { sendSuccessResponse, sendErrorResponse, sendNotFoundError, sendValidationError } = require("../../traits/responseHandler");
const { validationRequestPost, validateId } = require("../../request/products/productsRequest");
const { validationResult } = require("express-validator");
const { generateUniqueSlug } = require("../../../../../utils/slugHelper");
const { syncGallery, deleteGalleryFiles, discardGalleryUploads } = require("../../traits/gallerySync");

const dataModel = models.Products;
// the list image is the first slide of the detail carousel; `main_media_path` is legacy (no longer edited)
const fileFields = ["list_media_path"];

// Product labels (features / tags / specifications) are one master table
// discriminated by `type`; they are all attached through the same join.
const labelsInclude = {
  model: models.ProductLabels,
  as: "labels",
  attributes: ["id", "title", "title_ar", "slug", "type", "is_product_badge"],
  through: { attributes: [] },
  required: false,
};

// The product's single badge label (a master label flagged is_product_badge).
const badgeInclude = {
  model: models.ProductLabels,
  as: "badge",
  attributes: ["id", "title", "title_ar", "slug", "is_product_badge"],
  required: false,
};

// Attributes the product uses to build variants (Size, Color, ...).
const attributesInclude = {
  model: models.Attributes,
  as: "attributes",
  attributes: ["id", "title", "title_ar", "slug", "type"],
  through: { attributes: ["sort_order"] },
  required: false,
};

const detailInclude = [
  {
    model: models.ProductCategories,
    as: "category",
    attributes: ["id", "title", "title_ar"],
  },
  labelsInclude,
  badgeInclude,
  attributesInclude,
  {
    model: models.ProductImages,
    as: "images",
    attributes: ["id", "media_path", "media_alt", "media_alt_ar", "sort_order"],
    separate: true,
    order: [["sort_order", "ASC"], ["id", "ASC"]],
  },
  {
    model: dataModel,
    as: "relatedProducts",
    attributes: ["id", "title", "title_ar", "slug", "list_media_path", "price"],
    through: { attributes: [] },
  },
];

// Raw column list for the product list. The list only needs the product's own
// columns, one category, its labels, and a variant count — built with correlated
// subqueries so a single row per product comes back (no join multiplication /
// DISTINCT counting).
const listSelectColumns = `
  p.id, p.title, p.title_ar, p.slug, p.price,
  p.list_media_path, p.list_media_alt,
  p.sort_order, p.is_active, p.show_in_home, p.show_in_footer, p.list_in_navbar, p.product_category_id,
  c.id AS category_id, c.title AS category_title,
  COALESCE((
    SELECT json_agg(json_build_object(
      'id', l.id, 'title', l.title, 'title_ar', l.title_ar,
      'slug', l.slug, 'type', l.type, 'is_product_badge', l.is_product_badge
    ) ORDER BY l.id)
    FROM product_label_map plm
    JOIN product_labels l ON l.id = plm.label_id AND l.deleted_at IS NULL
    WHERE plm.product_id = p.id
  ), '[]'::json) AS labels,
  (SELECT COUNT(*) FROM product_variants v
    WHERE v.product_id = p.id AND v.deleted_at IS NULL) AS variant_count
`;

// Only rolls back if the transaction is still open.
const safeRollback = async (t) => {
  if (t && !t.finished) await t.rollback();
};

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
};

// null = field not sent (leave links untouched on update)
const parseIds = (value) => {
  if (value === undefined) return null;
  return [
    ...new Set(
      parseJsonArray(value)
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
};

// undefined = not sent (leave as-is); "" / "null" = explicit clear (null).
const parseOptionalId = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "" || value === "null") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// true when every id exists (soft-deleted rows don't count)
const allExist = async (model, ids, transaction) => {
  if (!ids || !ids.length) return true;
  const count = await model.count({ where: { id: ids }, transaction });
  return count === ids.length;
};

// Runs the checks shared by create and update. Returns an error array or null.
// Slug is never read from req.body here — it's always server-generated (see
// create()/update()), so there's nothing to check it against.
const validateRelations = async (req, ids, ignoreId, t) => {
  const { label_ids, related_product_ids, attribute_ids, badge_label_id } = ids;

  const category = await models.ProductCategories.findByPk(req.body.product_category_id, { transaction: t });
  if (!category) {
    return [{ path: "product_category_id", msg: "Category not found" }];
  }

  if (!(await allExist(models.ProductLabels, label_ids, t))) {
    return [{ path: "label_ids", msg: "One or more labels not found" }];
  }

  // The badge must be a label flagged is_product_badge.
  if (badge_label_id) {
    const badge = await models.ProductLabels.findOne({
      where: { id: badge_label_id, is_product_badge: true },
      transaction: t,
    });
    if (!badge) {
      return [{ path: "badge_label_id", msg: "Badge label not found or not a badge" }];
    }
  }

  if (!(await allExist(models.Attributes, attribute_ids, t))) {
    return [{ path: "attribute_ids", msg: "One or more attributes not found" }];
  }

  // A product cannot be related to itself.
  if (ignoreId && related_product_ids?.includes(Number(ignoreId))) {
    return [
      {
        path: "related_product_ids",
        msg: "A product cannot be related to itself",
      },
    ];
  }
  if (!(await allExist(dataModel, related_product_ids, t))) {
    return [
      {
        path: "related_product_ids",
        msg: "One or more related products not found",
      },
    ];
  }

  return null;
};

const readIds = (req) => {
  const ids = {
    label_ids: parseIds(req.body.label_ids),
    related_product_ids: parseIds(req.body.related_product_ids),
    attribute_ids: parseIds(req.body.attribute_ids),
    badge_label_id: parseOptionalId(req.body.badge_label_id),
  };
  delete req.body.label_ids;
  delete req.body.related_product_ids;
  delete req.body.attribute_ids;
  delete req.body.badge_label_id;
  return ids;
};

// null = not sent, so leave existing links alone
const syncLinks = async (item, ids, t) => {
  if (ids.label_ids !== null) await item.setLabels(ids.label_ids, { transaction: t });
  if (ids.related_product_ids !== null) await item.setRelatedProducts(ids.related_product_ids, { transaction: t });
  if (ids.attribute_ids !== null) await item.setAttributes(ids.attribute_ids, { transaction: t });
};

// The chosen badge label is also attached to the product's labels, so it isn't
// "badge-only". When label_ids wasn't sent, merge the badge into the current set.
const attachBadgeToLabels = async (item, ids, t) => {
  const badgeId = ids.badge_label_id;
  if (!badgeId) return;
  if (ids.label_ids !== null) {
    if (!ids.label_ids.includes(badgeId)) ids.label_ids.push(badgeId);
    return;
  }
  const current = await item.getLabels({ transaction: t, attributes: ["id"] });
  const currentIds = current.map((l) => l.id);
  if (!currentIds.includes(badgeId)) currentIds.push(badgeId);
  ids.label_ids = currentIds;
};

class ProductController {
  static async list(req, res) {
    try {
      const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const offset = (page - 1) * limit;
      const search = String(req.query.search || req.query.keyword || "").trim();
      const categoryId = parseInt(req.query.product_category_id, 10);

      const where = ["p.deleted_at IS NULL"];
      const replacements = { limit, offset };

      if (Number.isInteger(categoryId) && categoryId > 0) {
        where.push("p.product_category_id = :categoryId");
        replacements.categoryId = categoryId;
      }
      const status = req.query.status;
      if (status === "active") {
        where.push("p.is_active = TRUE");
      } else if (status === "inactive") {
        where.push("p.is_active = FALSE");
      }
      const showInHome = req.query.show_in_home;
      if (showInHome === "true") {
        where.push("p.show_in_home = TRUE");
      } else if (showInHome === "false") {
        where.push("p.show_in_home = FALSE");
      }
      const listInNavbar = req.query.list_in_navbar;
      if (listInNavbar === "true") {
        where.push("p.list_in_navbar = TRUE");
      } else if (listInNavbar === "false") {
        where.push("p.list_in_navbar = FALSE");
      }
      const showInFooter = req.query.show_in_footer;
      if (showInFooter === "true") {
        where.push("p.show_in_footer = TRUE");
      } else if (showInFooter === "false") {
        where.push("p.show_in_footer = FALSE");
      }
      if (search) {
        where.push("(p.title ILIKE :pattern OR p.title_ar ILIKE :pattern OR p.slug ILIKE :pattern)");
        replacements.pattern = `%${search}%`;
      }
      const whereClause = `WHERE ${where.join(" AND ")}`;

      const dataSql = `
        SELECT ${listSelectColumns}
        FROM products p
        LEFT JOIN product_categories c
          ON c.id = p.product_category_id AND c.deleted_at IS NULL
        ${whereClause}
        ORDER BY p.sort_order ASC, p.id ASC
        LIMIT :limit OFFSET :offset
      `;
      const countSql = `SELECT COUNT(*)::int AS count FROM products p ${whereClause}`;

      const [rows, countRows] = await Promise.all([
        sequelize.query(dataSql, { replacements, type: QueryTypes.SELECT }),
        sequelize.query(countSql, { replacements, type: QueryTypes.SELECT }),
      ]);

      const totalCount = countRows[0]?.count ?? 0;
      const data = rows.map((row) => {
        const { category_id, category_title, variant_count, ...rest } = row;
        return {
          ...rest,
          category: category_id ? { id: category_id, title: category_title } : null,
          variant_count: Number(variant_count) || 0,
        };
      });

      sendSuccessResponse(
        res,
        {
          data,
          pagination: {
            totalCount,
            totalPages: Math.max(1, Math.ceil(totalCount / limit)),
            currentPage: page,
            limit,
            isSearchApplied: Boolean(search),
            searchTerm: search || null,
          },
        },
        "Product  successfully",
      );
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  // Flat list for selects (for example related products)
  static async getActive(req, res) {
    try {
      const excludeId = parseInt(req.query.excludeId, 10);
      const where = { is_active: true };
      if (Number.isInteger(excludeId) && excludeId > 0) {
        where.id = { [Op.ne]: excludeId };
      }
      const result = await dataModel.findAll({
        where,
        order: [["sort_order", "ASC"]],
        attributes: ["id", "title", "title_ar", "slug", "list_media_path", "price"],
      });
      sendSuccessResponse(res, result, "Product list retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async getById(req, res) {
    await Promise.all(validateId.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    try {
      const { id } = req.params;

      const item = await dataModel.findByPk(id, {
        include: detailInclude,
      });
      if (!item) return sendNotFoundError(res, "Product");

      sendSuccessResponse(res, item, "Product retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async create(req, res) {
    await Promise.all(validationRequestPost.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    const t = await sequelize.transaction();
    try {
      handleFileUploadStore(req, fileFields);
      const ids = readIds(req);

      const relationErrors = await validateRelations(req, ids, null, t);
      if (relationErrors) {
        await safeRollback(t);
        return sendValidationError(res, relationErrors);
      }

      // Always server-generated — there is no slug field in the admin form.
      req.body.slug = await generateUniqueSlug(dataModel, req.body.title, { transaction: t });

      const item = await dataModel.create(
        { ...req.body, badge_label_id: ids.badge_label_id ?? null },
        { transaction: t },
      );
      // Make sure the badge is also one of the product's labels, then sync links.
      await attachBadgeToLabels(item, ids, t);
      await syncLinks(item, ids, t);
      await syncGallery(req, { Model: models.ProductImages, foreignKey: "product_id", ownerId: item.id }, t);

      await t.commit();

      const created = await dataModel.findByPk(item.id, {
        include: detailInclude,
      });
      sendSuccessResponse(res, created, "Product created successfully", 201);
    } catch (error) {
      console.error("Product create failed:", error);
      await safeRollback(t);
      await discardGalleryUploads(req);
      return sendErrorResponse(res, error);
    }
  }

  static async update(req, res) {
    await Promise.all([...validateId, ...validationRequestPost].map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const item = await dataModel.findByPk(id, { transaction: t });
      if (!item) {
        await safeRollback(t);
        return sendNotFoundError(res, "Product");
      }

      const ids = readIds(req);

      const relationErrors = await validateRelations(req, ids, id, t);
      if (relationErrors) {
        await safeRollback(t);
        return sendValidationError(res, relationErrors);
      }

      await handleFileUploadUpdate(req, item, fileFields);

      // Regenerated from the (possibly changed) title every time — an
      // unchanged title keeps its current slug since `excludeId` skips the
      // item's own row when checking for a collision.
      req.body.slug = await generateUniqueSlug(dataModel, req.body.title, { excludeId: id, transaction: t });

      const updateData = { ...req.body };
      if (ids.badge_label_id !== undefined) updateData.badge_label_id = ids.badge_label_id;
      await item.update(updateData, { transaction: t });

      // Make sure the badge is also attached to the product's labels.
      await attachBadgeToLabels(item, ids, t);
      await syncLinks(item, ids, t);
      const removedImages = await syncGallery(
        req,
        { Model: models.ProductImages, foreignKey: "product_id", ownerId: item.id },
        t,
      );

      await t.commit();
      await deleteGalleryFiles(removedImages);

      const updated = await dataModel.findByPk(id, {
        include: detailInclude,
      });
      sendSuccessResponse(res, updated, "Product updated successfully");
    } catch (error) {
      console.error("Product update failed:", error);
      await safeRollback(t);
      await discardGalleryUploads(req);
      return sendErrorResponse(res, error);
    }
  }

  static async destroy(req, res) {
    await Promise.all(validateId.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const item = await dataModel.findByPk(id, { transaction: t });
      if (!item) {
        await safeRollback(t);
        return sendNotFoundError(res, "Product");
      }

      // Paranoid delete keeps the row, so clear links and soft-delete children.
      await item.setLabels([], { transaction: t });
      await item.setRelatedProducts([], { transaction: t });
      await item.setAttributes([], { transaction: t });

      // Also remove rows where OTHER products list this one as related.
      const RelatedThrough = dataModel.associations.relatedProducts.through.model;
      await RelatedThrough.destroy({
        where: { related_product_id: id },
        transaction: t,
      });

      // Variants are soft-deleted; their value links are hard-deleted.
      const variants = await models.ProductVariants.findAll({
        where: { product_id: id },
        attributes: ["id"],
        transaction: t,
      });
      const variantIds = variants.map((v) => v.id);
      let variantImages = [];
      if (variantIds.length) {
        await models.VariantAttributeValues.destroy({
          where: { variant_id: variantIds },
          transaction: t,
        });
        // Variants are only soft-deleted, so the FK's ON DELETE CASCADE on
        // detail_mappings.variant_id never fires — clean these up explicitly,
        // same as the value links above.
        await models.DetailItemExclusions.destroy({
          where: { variant_id: variantIds },
          transaction: t,
        });
        await models.DetailMappings.destroy({
          where: { variant_id: variantIds },
          transaction: t,
        });
        variantImages = await models.ProductVariantImages.findAll({
          where: { variant_id: variantIds },
          transaction: t,
        });
        await models.ProductVariantImages.destroy({
          where: { variant_id: variantIds },
          transaction: t,
        });
      }
      await models.ProductVariants.destroy({
        where: { product_id: id },
        transaction: t,
      });

      // Product is only soft-deleted too; hard-delete its own detail
      // mappings (items/exclusions cascade via the real DB FK).
      await models.DetailMappings.destroy({
        where: { product_id: id },
        transaction: t,
      });

      await models.Faqs.destroy({
        where: { product_id: id },
        transaction: t,
      });
      const productImages = await models.ProductImages.findAll({ where: { product_id: id }, transaction: t });
      await models.ProductImages.destroy({ where: { product_id: id }, transaction: t });
      await item.destroy({ transaction: t });

      await t.commit();

      await deleteOldFile(item.main_media_path);
      await deleteOldFile(item.list_media_path);
      await deleteGalleryFiles([...productImages, ...variantImages]);

      sendSuccessResponse(res, { id }, "Product deleted successfully");
    } catch (error) {
      console.error("Product delete failed:", error);
      await safeRollback(t);
      return sendErrorResponse(res, error);
    }
  }
}

module.exports = ProductController;
