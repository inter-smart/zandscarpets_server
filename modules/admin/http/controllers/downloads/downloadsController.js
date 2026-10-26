const { models } = require("../../../../../database/models");
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
const { validationRequestPost, validateId } = require("../../request/downloads/downloadsRequest");
const { validationResult } = require("express-validator");

const dataModel = models.Downloads;
const fileFields = ["file_path"];

class DownloadsController {
  static async list(req, res) {
    try {
      const result = await paginate(dataModel, req, {
        order: [["sort_order", "ASC"], ["id", "ASC"]],
        searchFields: ["title", "title_ar"],
      });
      sendSuccessResponse(res, result, "Downloads retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async getById(req, res) {
    await Promise.all(validateId.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    try {
      const item = await dataModel.findByPk(req.params.id);
      if (!item) return sendNotFoundError(res, "Download");
      sendSuccessResponse(res, item, "Download retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async create(req, res) {
    await Promise.all(validationRequestPost.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    try {
      handleFileUploadStore(req, fileFields);

      // the uploaded file's own name / size, shown in the admin list and reused if later needed
      const uploaded = req.files?.file_path?.[0];
      if (uploaded) {
        req.body.file_original_filename = uploaded.originalname;
        req.body.file_size_bytes = uploaded.size;
      }

      const item = await dataModel.create(req.body);
      sendSuccessResponse(res, item, "Download created successfully", 201);
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async update(req, res) {
    await Promise.all([...validateId, ...validationRequestPost].map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    try {
      const { id } = req.params;
      const item = await dataModel.findByPk(id);
      if (!item) return sendNotFoundError(res, "Download");

      await handleFileUploadUpdate(req, item, fileFields);

      const uploaded = req.files?.file_path?.[0];
      if (uploaded) {
        req.body.file_original_filename = uploaded.originalname;
        req.body.file_size_bytes = uploaded.size;
      }

      await item.update(req.body);
      sendSuccessResponse(res, item, "Download updated successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async destroy(req, res) {
    await Promise.all(validateId.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    try {
      const { id } = req.params;
      const item = await dataModel.findByPk(id);
      if (!item) return sendNotFoundError(res, "Download");

      if (item.file_path) await deleteOldFile(item.file_path);
      await item.destroy();

      sendSuccessResponse(res, { id }, "Download deleted successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }
}

module.exports = DownloadsController;
