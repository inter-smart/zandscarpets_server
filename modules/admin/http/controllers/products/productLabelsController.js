const { sequelize, models } = require("../../../../../database/models");
const { generateSlug, generateUniqueSlug, assertNoDuplicate } = require("../../../../../utils/slugHelper");
const { sendSuccessResponse, sendErrorResponse, sendNotFoundError, sendValidationError } = require("../../traits/responseHandler");
const { paginate } = require("../../traits/datatablePaginationHelper");
const { validationRequestPost, validateId } = require("../../request/products/productLabelsRequest");
const { validationResult } = require("express-validator");

const dataModel = models.ProductLabels;
const LABEL_TYPES = ["feature", "tag", "specification"];

const labelType = (value) => (LABEL_TYPES.includes(value) ? value : undefined);

// Generate a unique slug (or slugify + verify a provided one), scoped to the
// label `type` so the same slug can exist in different sections.
const normalizeSlug = async (req, item, { excludeId, transaction } = {}) => {
  const slug = req.body.slug;
  const sourceTitle = req.body.title || item?.title;
  const type = labelType(req.body.type) || item?.type;
  const scope = type ? { type } : undefined;
  if (!slug || !String(slug).trim()) {
    req.body.slug = await generateUniqueSlug(dataModel, sourceTitle, {
      excludeId,
      transaction,
      scope,
    });
    return;
  }
  req.body.slug = generateSlug(slug);
  if (!item || item.slug !== req.body.slug) {
    await assertNoDuplicate(dataModel, {
      field: "slug",
      value: req.body.slug,
      excludeId,
      transaction,
      scope,
    });
  }
};

class ProductLabelController {
  static async list(req, res) {
    try {
      const where = {};
      const type = labelType(req.query.type);
      if (type) where.type = type;

      const result = await paginate(dataModel, req, {
        where,
        order: [["sort_order", "ASC"]],
        searchFields: ["title", "title_ar", "slug"],
      });

      return sendSuccessResponse(res, result, "Product label list retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  // Flat list for product form selects
  static async getActive(req, res) {
    try {
      const where = { is_active: true };
      const type = labelType(req.query.type);
      if (type) where.type = type;

      // `?badge=true` limits the list to badge-capable labels (the badge picker).
      if (req.query.badge === "true" || req.query.badge === "1") {
        where.is_product_badge = true;
      }

      const result = await dataModel.findAll({
        where,
        order: [["sort_order", "ASC"]],
        attributes: ["id", "title", "title_ar", "type", "is_product_badge", "show_in_filter"],
      });

      return sendSuccessResponse(res, result, "Product label list retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async getById(req, res) {
    await Promise.all(validateId.map((v) => v.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendValidationError(res, errors.array());
    }

    try {
      const { id } = req.params;
      const item = await dataModel.findByPk(id);

      if (!item) {
        return sendNotFoundError(res, "Product label");
      }

      return sendSuccessResponse(res, item, "Product label retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async create(req, res) {
    await Promise.all(validationRequestPost.map((v) => v.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendValidationError(res, errors.array());
    }

    const t = await sequelize.transaction();

    try {
      await assertNoDuplicate(dataModel, {
        field: "title",
        value: req.body.title,
        scope: { type: req.body.type || "feature" },
        transaction: t,
      });
      await normalizeSlug(req, null, { transaction: t });

      const item = await dataModel.create(req.body, {
        transaction: t,
      });

      await t.commit();

      return sendSuccessResponse(res, item, "Product label created successfully", 201);
    } catch (error) {
      await t.rollback();
      return sendErrorResponse(res, error);
    }
  }

  static async update(req, res) {
    await Promise.all([...validateId, ...validationRequestPost].map((v) => v.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendValidationError(res, errors.array());
    }

    const t = await sequelize.transaction();

    try {
      const { id } = req.params;

      const item = await dataModel.findByPk(id, {
        transaction: t,
      });

      if (!item) {
        await t.rollback();
        return sendNotFoundError(res, "Product label");
      }

      await assertNoDuplicate(dataModel, {
        field: "title",
        value: req.body.title,
        excludeId: id,
        scope: { type: req.body.type || item.type },
        transaction: t,
      });
      await normalizeSlug(req, item, { excludeId: id, transaction: t });

      await item.update(req.body, {
        transaction: t,
      });

      await t.commit();

      const updated = await dataModel.findByPk(id);

      return sendSuccessResponse(res, updated, "Product label updated successfully");
    } catch (error) {
      if (!t.finished) {
        await t.rollback();
      }

      return sendErrorResponse(res, error);
    }
  }

  static async destroy(req, res) {
    await Promise.all(validateId.map((v) => v.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendValidationError(res, errors.array());
    }

    const t = await sequelize.transaction();

    try {
      const { id } = req.params;

      const item = await dataModel.findByPk(id, {
        transaction: t,
      });

      if (!item) {
        await t.rollback();
        return sendNotFoundError(res, "Product label");
      }

      await item.destroy({
        transaction: t,
      });

      await t.commit();

      return sendSuccessResponse(res, { id }, "Product label deleted successfully");
    } catch (error) {
      if (!t.finished) {
        await t.rollback();
      }

      return sendErrorResponse(res, error);
    }
  }
}

module.exports = ProductLabelController;
