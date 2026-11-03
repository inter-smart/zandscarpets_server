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
} = require("../../request/home/homeTestimonailsRequest");
const { validationResult } = require("express-validator");

const dataModel = models.HomeTestimonials;
const fileFields = ["profile_media_path"];

class HomeTestimonialsController {
  static async list(req, res) {
    try {
      const result = await paginate(dataModel, req, {
        order: [["sort_order", "ASC"]],
        searchFields: ["name", "designation"],
      });

      sendSuccessResponse(res, result, "Home testimonials retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async getById(req, res) {
    await Promise.all(validateId.map((validation) => validation.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    try {
      const { id } = req.params;

      const item = await dataModel.findByPk(id);
      if (!item) return sendNotFoundError(res, "Home testimonial");

      sendSuccessResponse(res, item, "Home testimonial retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async create(req, res) {
    await Promise.all(validationRequestPost.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    const t = await sequelize.transaction();
    try {
      handleFileUploadStore(req, fileFields);
      const item = await dataModel.create(req.body, { transaction: t });

      await t.commit();

      sendSuccessResponse(res, item, "Home testimonial created successfully", 201);
    } catch (error) {
      await t.rollback();
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
      const item = await dataModel.findByPk(id);
      if (!item) {
        await t.rollback();
        return sendNotFoundError(res, "Home testimonial");
      }

      await handleFileUploadUpdate(req, item, fileFields);

      // empty value without a new upload = the admin removed the image
      const oldProfilePath = item.profile_media_path;
      const profileRemoved = req.body.profile_media_path === "" && oldProfilePath;
      if (req.body.profile_media_path === "") req.body.profile_media_path = null;

      await item.update(req.body, { transaction: t });

      await t.commit();

      if (profileRemoved) await deleteOldFile(oldProfilePath);

      sendSuccessResponse(res, item, "Home testimonial updated successfully");
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
        return sendNotFoundError(res, "Home testimonial");
      }

      await item.destroy({ transaction: t });

      await t.commit();

      if (item.profile_media_path) await deleteOldFile(item.profile_media_path);

      sendSuccessResponse(res, { id: id }, "Home testimonial deleted successfully");
    } catch (error) {
      await t.rollback();
      return sendErrorResponse(res, error);
    }
  }
}

module.exports = HomeTestimonialsController;
