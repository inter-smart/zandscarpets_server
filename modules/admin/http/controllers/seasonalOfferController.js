const { models } = require("../../../../database/models");
const {
  handleFileUploadUpdate,
  handleFileUploadStore,
  deleteOldFile,
} = require("../middleware/multerMiddleware");
const {
  sendErrorResponse,
  sendSuccessResponse,
  sendValidationError,
} = require("../traits/responseHandler");
const {
  validateId,
  validationRequestPost,
} = require("../request/seasonalOfferRequest");
const { validationResult } = require("express-validator");

const fileFields = ["media_path", "mobile_media_path", "badge_image"];
// optional images: omitted from the form submit means the admin removed them
const optionalFileFields = ["mobile_media_path", "badge_image"];

class SeasonalOfferController {
  static async get(req, res) {
    try {
      const data = await models.SeasonalOffer.findOne();

      sendSuccessResponse(res, data, "Seasonal Offer retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async update(req, res) {
    await Promise.all(
      [...validateId, ...validationRequestPost].map((v) => v.run(req)),
    );
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendValidationError(res, errors.array());
    }

    try {
      let seasonalOffer = await models.SeasonalOffer.findOne();

      if (!seasonalOffer) {
        if (!req.files?.media_path?.[0]) {
          return sendValidationError(res, [
            { msg: "media_path (image) is required", path: "media_path" },
          ]);
        }
        handleFileUploadStore(req, fileFields);
        seasonalOffer = await models.SeasonalOffer.create(req.body);
      } else {
        if (!req.files?.media_path?.[0] && !seasonalOffer.media_path) {
          return sendValidationError(res, [
            { msg: "media_path (image) is required", path: "media_path" },
          ]);
        }
        await handleFileUploadUpdate(req, seasonalOffer, fileFields);
        // Badge and mobile image are optional: if no new file and no existing
        // path was sent back, the admin removed it — clear it (and its file)
        // instead of keeping the old value.
        for (const field of optionalFileFields) {
          if (!req.files?.[field]?.[0] && !req.body[field]) {
            if (seasonalOffer[field]) {
              try {
                await deleteOldFile(seasonalOffer[field]);
              } catch (error) {
                console.error(`Failed to delete old ${field}:`, error);
              }
            }
            req.body[field] = null;
          }
        }
        await seasonalOffer.update(req.body);
      }

      sendSuccessResponse(res, seasonalOffer, "Seasonal Offer updated successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }
}

module.exports = SeasonalOfferController;
