const { Op } = require("sequelize");
const { sequelize, models } = require("../../../../../database/models");
const { buildSkuBase, generateUniqueSku } = require("../../../../../utils/skuHelper");
const {
  handleFileUploadUpdate,
  handleFileUploadStore,
  deleteOldFile,
} = require("../../middleware/multerMiddleware");
const {
  sendSuccessResponse,
  sendErrorResponse,
  sendNotFoundError,
  sendValidationError,
} = require("../../traits/responseHandler");
const { paginate } = require("../../traits/datatablePaginationHelper");
const {
  validationRequestPost,
  generateRequest,
  validateId,
} = require("../../request/products/variantsRequest");
const { validationResult } = require("express-validator");
const { syncGallery, deleteGalleryFiles, discardGalleryUploads } = require("../../traits/gallerySync");

const dataModel = models.ProductVariants;
const fileFields = ["media_path"];

// A variant carries one value link per attribute it uses; each link embeds the
// attribute and the chosen value so the admin can render them directly.
const valueLinksInclude = {
  model: models.VariantAttributeValues,
  as: "valueLinks",
  attributes: ["id", "attribute_id", "attribute_value_id"],
  include: [
    {
      model: models.Attributes,
      as: "attribute",
      attributes: ["id", "title", "title_ar", "type"],
    },
    {
      model: models.AttributeValues,
      as: "attributeValue",
      attributes: [
        "id",
        "value",
        "value_ar",
        "slug",
        "media_path",
        "color_code",
      ],
    },
  ],
};

const listInclude = [valueLinksInclude];
const detailInclude = [
  {
    model: models.Products,
    as: "product",
    attributes: ["id", "title", "title_ar"],
  },
  valueLinksInclude,
  {
    model: models.ProductVariantImages,
    as: "images",
    attributes: ["id", "media_path", "media_alt", "media_alt_ar", "sort_order"],
    separate: true,
    order: [["sort_order", "ASC"], ["id", "ASC"]],
  },
];

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

// null = field not sent (leave existing links untouched on update)
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

// The attribute ids a product uses, in display order.
const loadProductAttributes = (productId, t) =>
  models.ProductAttributes.findAll({
    where: { product_id: productId },
    order: [
      ["sort_order", "ASC"],
      ["id", "ASC"],
    ],
    transaction: t,
  });

// Deterministic combination key: selected value ids, ascending, joined by "-".
const buildCombinationKey = (valueIds) =>
  [...valueIds]
    .map(Number)
    .sort((a, b) => a - b)
    .join("-");

const buildLabel = (values, field) =>
  values
    .map((v) => v[field])
    .filter((v) => v && String(v).trim())
    .join(" / ");

// Validates that `valueIds` is exactly one value per attribute the product
// uses, each value belonging to its attribute. Returns { errors } or
// { links } ordered by the product's attribute order.
const validateSelection = async (productId, valueIds, t) => {
  const productAttributes = await loadProductAttributes(productId, t);
  const attributeIds = productAttributes.map((pa) => pa.attribute_id);

  if (!attributeIds.length) {
    return {
      errors: [
        {
          path: "attribute_value_ids",
          msg: "This product has no attributes; add attributes before creating variants",
        },
      ],
    };
  }

  const ids = [...new Set(valueIds)];
  if (ids.length !== attributeIds.length) {
    return {
      errors: [
        {
          path: "attribute_value_ids",
          msg: "Exactly one value is required for each attribute the product uses",
        },
      ],
    };
  }

  const values = await models.AttributeValues.findAll({
    where: { id: ids },
    transaction: t,
  });
  if (values.length !== ids.length) {
    return {
      errors: [
        { path: "attribute_value_ids", msg: "One or more attribute values not found" },
      ],
    };
  }

  const byAttribute = new Map();
  for (const value of values) {
    if (!attributeIds.includes(value.attribute_id)) {
      return {
        errors: [
          {
            path: "attribute_value_ids",
            msg: "Attribute value is not for an attribute this product uses",
          },
        ],
      };
    }
    byAttribute.set(value.attribute_id, value);
  }

  const links = [];
  for (const attributeId of attributeIds) {
    const value = byAttribute.get(attributeId);
    if (!value) {
      return {
        errors: [
          {
            path: "attribute_value_ids",
            msg: "Exactly one value is required for each attribute the product uses",
          },
        ],
      };
    }
    links.push({
      attribute_id: attributeId,
      attribute_value_id: value.id,
      value,
    });
  }

  return { links };
};

const skuTaken = async (sku, ignoreId, t) => {
  if (!sku || !String(sku).trim()) return false;
  const found = await dataModel.findOne({
    where: sequelize.where(
      sequelize.fn("lower", sequelize.col("sku")),
      String(sku).trim().toLowerCase(),
    ),
    transaction: t,
  });
  if (!found) return false;
  return !ignoreId || found.id !== Number(ignoreId);
};

const combinationTaken = async (productId, key, ignoreId, t) => {
  const where = { product_id: productId, combination_key: key };
  if (ignoreId) where.id = { [Op.ne]: Number(ignoreId) };
  return !!(await dataModel.findOne({ where, transaction: t }));
};

const replaceValueLinks = async (variantId, links, t) => {
  await models.VariantAttributeValues.destroy({
    where: { variant_id: variantId },
    transaction: t,
  });
  if (links.length) {
    await models.VariantAttributeValues.bulkCreate(
      links.map((link) => ({
        variant_id: variantId,
        attribute_id: link.attribute_id,
        attribute_value_id: link.attribute_value_id,
      })),
      { transaction: t },
    );
  }
};

// Cartesian product of [[a,b],[1,2]] -> [[a,1],[a,2],[b,1],[b,2]].
const cartesian = (lists) =>
  lists.reduce(
    (acc, list) => acc.flatMap((combo) => list.map((value) => [...combo, value])),
    [[]],
  );

const normalizeSelections = (raw) => {
  const list = parseJsonArray(raw);
  return list.map((entry) => ({
    attribute_id: Number(entry?.attribute_id),
    value_ids: Array.isArray(entry?.value_ids)
      ? [...new Set(entry.value_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
      : [],
  }));
};

class VariantsController {
  static async getActive(req, res) {
    try {
      const result = await dataModel.findAll({
        where: { is_active: true },
        order: [
          ["sort_order", "ASC"],
          ["id", "ASC"],
        ],
        attributes: ["id", "label", "product_id"],
        include: [
          {
            model: models.Products,
            as: "product",
            attributes: ["id", "title"],
          },
        ],
      });
      return sendSuccessResponse(res, result, "Active product variants retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async list(req, res) {
    try {
      const where = {};
      const productId = parseInt(req.query.product_id, 10);
      if (Number.isInteger(productId) && productId > 0) {
        where.product_id = productId;
      }
      const status = req.query.status;
      if (status === "active") {
        where.is_active = true;
      } else if (status === "inactive") {
        where.is_active = false;
      }

      const result = await paginate(dataModel, req, {
        where,
        order: [
          ["sort_order", "ASC"],
          ["id", "ASC"],
        ],
        searchFields: ["label", "label_ar", "sku"],
        include: listInclude,
      });

      return sendSuccessResponse(res, result, "Product variant list retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async getById(req, res) {
    await Promise.all(validateId.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    try {
      const item = await dataModel.findByPk(req.params.id, {
        include: detailInclude,
      });
      if (!item) return sendNotFoundError(res, "Product variant");
      return sendSuccessResponse(res, item, "Product variant retrieved successfully");
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
      const product = await models.Products.findByPk(req.body.product_id, {
        transaction: t,
      });
      if (!product) {
        await safeRollback(t);
        return sendValidationError(res, [{ path: "product_id", msg: "Product not found" }]);
      }

      const valueIds = parseIds(req.body.attribute_value_ids) || [];
      const selection = await validateSelection(product.id, valueIds, t);
      if (selection.errors) {
        await safeRollback(t);
        return sendValidationError(res, selection.errors);
      }

      const combinationKey = buildCombinationKey(
        selection.links.map((l) => l.attribute_value_id),
      );
      if (await combinationTaken(product.id, combinationKey, null, t)) {
        await safeRollback(t);
        return sendValidationError(res, [
          { path: "attribute_value_ids", msg: "This combination already exists" },
        ]);
      }
      if (await skuTaken(req.body.sku, null, t)) {
        await safeRollback(t);
        return sendValidationError(res, [{ path: "sku", msg: "SKU is already in use" }]);
      }

      handleFileUploadStore(req, fileFields);

      const values = selection.links.map((l) => l.value);
      const sku = req.body.sku
        ? req.body.sku
        : await generateUniqueSku(dataModel, buildSkuBase(product, values), { transaction: t });
      const item = await dataModel.create(
        {
          product_id: product.id,
          label: req.body.label || buildLabel(values, "value"),
          label_ar: req.body.label_ar || buildLabel(values, "value_ar"),
          sku,
          media_path: req.body.media_path || null,
          media_alt: req.body.media_alt || null,
          media_alt_ar: req.body.media_alt_ar || null,
          combination_key: combinationKey,
          sort_order: req.body.sort_order,
          is_active: req.body.is_active,
        },
        { transaction: t },
      );

      await replaceValueLinks(item.id, selection.links, t);
      await syncGallery(req, { Model: models.ProductVariantImages, foreignKey: "variant_id", ownerId: item.id }, t);

      await t.commit();

      const created = await dataModel.findByPk(item.id, { include: detailInclude });
      return sendSuccessResponse(res, created, "Product variant created successfully", 201);
    } catch (error) {
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
      const item = await dataModel.findByPk(req.params.id, { transaction: t });
      if (!item) {
        await safeRollback(t);
        return sendNotFoundError(res, "Product variant");
      }

      const fields = {
        sku: req.body.sku || null,
        media_alt: req.body.media_alt || null,
        media_alt_ar: req.body.media_alt_ar || null,
        sort_order: req.body.sort_order,
        is_active: req.body.is_active,
      };

      // Only revalidate the combination when values are (re)submitted.
      const valueIds = parseIds(req.body.attribute_value_ids);
      if (valueIds !== null) {
        const selection = await validateSelection(item.product_id, valueIds, t);
        if (selection.errors) {
          await safeRollback(t);
          return sendValidationError(res, selection.errors);
        }

        const combinationKey = buildCombinationKey(
          selection.links.map((l) => l.attribute_value_id),
        );
        if (await combinationTaken(item.product_id, combinationKey, item.id, t)) {
          await safeRollback(t);
          return sendValidationError(res, [
            { path: "attribute_value_ids", msg: "This combination already exists" },
          ]);
        }

        const values = selection.links.map((l) => l.value);
        fields.combination_key = combinationKey;
        fields.label = req.body.label || buildLabel(values, "value");
        fields.label_ar = req.body.label_ar || buildLabel(values, "value_ar");

        await replaceValueLinks(item.id, selection.links, t);
      } else if (req.body.label) {
        fields.label = req.body.label;
        if (req.body.label_ar) fields.label_ar = req.body.label_ar;
      }

      if (await skuTaken(fields.sku, item.id, t)) {
        await safeRollback(t);
        return sendValidationError(res, [{ path: "sku", msg: "SKU is already in use" }]);
      }

      await handleFileUploadUpdate(req, item, fileFields);
      if (req.body.media_path !== undefined) {
        fields.media_path = req.body.media_path || null;
      }

      await item.update(fields, { transaction: t });
      const removedImages = await syncGallery(
        req,
        { Model: models.ProductVariantImages, foreignKey: "variant_id", ownerId: item.id },
        t,
      );

      await t.commit();
      await deleteGalleryFiles(removedImages);

      const updated = await dataModel.findByPk(item.id, { include: detailInclude });
      return sendSuccessResponse(res, updated, "Product variant updated successfully");
    } catch (error) {
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
      const item = await dataModel.findByPk(req.params.id, { transaction: t });
      if (!item) {
        await safeRollback(t);
        return sendNotFoundError(res, "Product variant");
      }

      await models.VariantAttributeValues.destroy({
        where: { variant_id: item.id },
        transaction: t,
      });
      // The variant is only soft-deleted, so the FK's ON DELETE CASCADE on
      // detail_mappings.variant_id never fires — clean these up explicitly
      // (items cascade via the real DB FK once the mapping row is gone).
      await models.DetailItemExclusions.destroy({
        where: { variant_id: item.id },
        transaction: t,
      });
      await models.DetailMappings.destroy({
        where: { variant_id: item.id },
        transaction: t,
      });
      const mediaPath = item.media_path;
      const galleryRows = await models.ProductVariantImages.findAll({
        where: { variant_id: item.id },
        transaction: t,
      });
      await models.ProductVariantImages.destroy({ where: { variant_id: item.id }, transaction: t });
      await item.destroy({ transaction: t });

      await t.commit();
      await deleteOldFile(mediaPath);
      await deleteGalleryFiles(galleryRows);

      return sendSuccessResponse(res, { id: item.id }, "Product variant deleted successfully");
    } catch (error) {
      await safeRollback(t);
      return sendErrorResponse(res, error);
    }
  }

  // Builds every combination of the chosen values, skipping ones that already
  // exist for the product.
  static async generate(req, res) {
    await Promise.all(generateRequest.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    const t = await sequelize.transaction();
    try {
      const product = await models.Products.findByPk(req.body.product_id, {
        transaction: t,
      });
      if (!product) {
        await safeRollback(t);
        return sendValidationError(res, [{ path: "product_id", msg: "Product not found" }]);
      }

      const productAttributes = await loadProductAttributes(product.id, t);
      const attributeIds = productAttributes.map((pa) => pa.attribute_id);
      if (!attributeIds.length) {
        await safeRollback(t);
        return sendValidationError(res, [
          {
            path: "selections",
            msg: "This product has no attributes; add attributes before generating variants",
          },
        ]);
      }

      const selections = normalizeSelections(req.body.selections);
      const byAttribute = new Map();
      for (const selection of selections) {
        if (!attributeIds.includes(selection.attribute_id)) {
          await safeRollback(t);
          return sendValidationError(res, [
            { path: "selections", msg: "Selections include an attribute this product does not use" },
          ]);
        }
        if (byAttribute.has(selection.attribute_id)) {
          await safeRollback(t);
          return sendValidationError(res, [
            { path: "selections", msg: "Duplicate attribute in selections" },
          ]);
        }
        if (!selection.value_ids.length) {
          await safeRollback(t);
          return sendValidationError(res, [
            { path: "selections", msg: "Each attribute needs at least one value" },
          ]);
        }
        byAttribute.set(selection.attribute_id, selection.value_ids);
      }

      if (byAttribute.size !== attributeIds.length) {
        await safeRollback(t);
        return sendValidationError(res, [
          { path: "selections", msg: "Provide values for every attribute the product uses" },
        ]);
      }

      const allValueIds = [...byAttribute.values()].flat();
      const values = await models.AttributeValues.findAll({
        where: { id: allValueIds },
        transaction: t,
      });
      const valueById = new Map(values.map((v) => [v.id, v]));
      for (const [attributeId, valueIds] of byAttribute) {
        for (const valueId of valueIds) {
          const value = valueById.get(valueId);
          if (!value || value.attribute_id !== attributeId) {
            await safeRollback(t);
            return sendValidationError(res, [
              { path: "selections", msg: "An attribute value does not belong to its attribute" },
            ]);
          }
        }
      }

      const orderedLists = attributeIds.map((id) => byAttribute.get(id));
      const combinations = cartesian(orderedLists);

      const existing = await dataModel.findAll({
        where: { product_id: product.id },
        attributes: ["combination_key"],
        transaction: t,
      });
      const existingKeys = new Set(existing.map((v) => v.combination_key));

      const maxSort = (await dataModel.max("sort_order", {
        where: { product_id: product.id },
        transaction: t,
      })) || 0;
      let sortOrder = Number(maxSort);

      const created = [];
      const skipped = [];

      for (const combo of combinations) {
        const key = buildCombinationKey(combo);
        if (existingKeys.has(key)) {
          skipped.push(key);
          continue;
        }

        const comboValues = combo.map((id) => valueById.get(id));
        const links = attributeIds.map((attributeId, index) => ({
          attribute_id: attributeId,
          attribute_value_id: combo[index],
        }));

        const sku = await generateUniqueSku(dataModel, buildSkuBase(product, comboValues), { transaction: t });
        const item = await dataModel.create(
          {
            product_id: product.id,
            label: buildLabel(comboValues, "value"),
            label_ar: buildLabel(comboValues, "value_ar"),
            sku,
            combination_key: key,
            sort_order: ++sortOrder,
            is_active: true,
          },
          { transaction: t },
        );
        await replaceValueLinks(item.id, links, t);
        existingKeys.add(key);
        created.push(item.id);
      }

      await t.commit();

      return sendSuccessResponse(
        res,
        { created: created.length, skipped: skipped.length, variant_ids: created, skipped_keys: skipped },
        `${created.length} variant(s) generated`,
        201,
      );
    } catch (error) {
      await safeRollback(t);
      return sendErrorResponse(res, error);
    }
  }

  // Resolve a variant from a set of attribute value ids (product option picker).
  static async match(req, res) {
    try {
      const productId = parseInt(req.query.product_id, 10);
      const valueIds = String(req.query.value_ids || "")
        .split(",")
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0);

      if (!Number.isInteger(productId) || productId <= 0) {
        return sendValidationError(res, [{ path: "product_id", msg: "Product is required" }]);
      }
      if (!valueIds.length) {
        return sendValidationError(res, [
          { path: "value_ids", msg: "At least one attribute value id is required" },
        ]);
      }

      const item = await dataModel.findOne({
        where: {
          product_id: productId,
          combination_key: buildCombinationKey(valueIds),
        },
        include: detailInclude,
      });

      return sendSuccessResponse(
        res,
        item,
        item ? "Variant found" : "No variant for that combination",
      );
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }
}

module.exports = VariantsController;
