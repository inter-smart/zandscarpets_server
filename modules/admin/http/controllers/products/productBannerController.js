const { sequelize, models } = require("../../../../../database/models");
const {
  handleFileUploadUpdate,
  deleteOldFile,
  handleFileUploadStore,
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
  validateId,
} = require("../../request/products/productBannerRequest");
const { validationResult } = require("express-validator");
const { Op } = require("sequelize");

const dataModel = models.ProductBanners;
const fileFields = ["media_path"];
const productInclude = {
  model: models.Products,
  as: "product",
  attributes: ["id", "title"],
};

class ProductBannerController {
  static async list(req, res) {
    try {
      const result = await paginate(dataModel, req, {
        order: [["id", "ASC"]],
        searchFields: ["title", "sub_title", "product.title"],
        include: [productInclude],
      });

      sendSuccessResponse(
        res,
        result,
        "Product banners list retrieved successfully",
      );
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async getById(req, res) {
    await Promise.all(validateId.map((validation) => validation.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    try {
      const item = await dataModel.findByPk(req.params.id, {
        include: [productInclude],
      });
      if (!item) return sendNotFoundError(res, "Product banner");

      sendSuccessResponse(res, item, "Product banner retrieved successfully");
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
        attributes: ["id", "title"],
        transaction: t,
      });
      if (!product) throw "Selected product does not exist";

      const isItemExist = await dataModel.findOne({
        where: { product_id: req.body.product_id },
        attributes: ["id"],
        transaction: t,
      });
      if (isItemExist) throw `${product.title} already has a banner`;

      handleFileUploadStore(req, fileFields);

      const item = await dataModel.create(req.body, { transaction: t });

      await t.commit();

      sendSuccessResponse(
        res,
        item,
        "Product banner created successfully",
        201,
      );
    } catch (error) {
      await t.rollback();
      return sendErrorResponse(res, error);
    }
  }

  static async update(req, res) {
    await Promise.all(
      [...validateId, ...validationRequestPost].map((v) => v.run(req)),
    );
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    const t = await sequelize.transaction();
    try {
      const item = await dataModel.findByPk(req.params.id);
      if (!item) {
        await t.rollback();
        return sendNotFoundError(res, "Product banner");
      }

      const product = await models.Products.findByPk(req.body.product_id, {
        attributes: ["id", "title"],
        transaction: t,
      });
      if (!product) throw "Selected product does not exist";

      const isItemExist = await dataModel.findOne({
        where: {
          product_id: req.body.product_id,
          id: { [Op.ne]: req.params.id },
        },
        attributes: ["id"],
        transaction: t,
      });
      if (isItemExist) throw `${product.title} already has a banner`;

      await handleFileUploadUpdate(req, item, fileFields);
      await item.update(req.body, { transaction: t });

      await t.commit();

      sendSuccessResponse(res, item, "Product banner updated successfully");
    } catch (error) {
      await t.rollback();
      return sendErrorResponse(res, error);
    }
  }

  static async destroy(req, res) {
    await Promise.all(validateId.map((validation) => validation.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const item = await dataModel.findByPk(id);
      if (!item) {
        await t.rollback();
        return sendNotFoundError(res, "Product banner");
      }

      await item.destroy({ transaction: t });

      await t.commit();

      if (item.media_path) await deleteOldFile(item.media_path);

      sendSuccessResponse(res, { id }, "Product banner deleted successfully");
    } catch (error) {
      await t.rollback();
      return sendErrorResponse(res, error);
    }
  }
}

module.exports = ProductBannerController;
