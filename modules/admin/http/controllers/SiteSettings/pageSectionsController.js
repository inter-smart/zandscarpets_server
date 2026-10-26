const { models } = require("../../../../../database/models");
const { PAGE_SECTIONS } = require("../../../../../database/seeders/pageSections");
const {
  sendErrorResponse,
  sendSuccessResponse,
  sendValidationError,
} = require("../../traits/responseHandler");
const {
  validatePageSlug,
  validateToggle,
} = require("../../request/siteSettings/pageSectionsRequest");
const { validationResult } = require("express-validator");

class PageSectionsController {
  // Registry sections for a page, each merged with its stored `is_enabled` (default true).
  static async get(req, res) {
    await Promise.all(validatePageSlug.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    try {
      const { page_slug } = req.query;
      const rows = await models.PageSectionSetting.findAll({ where: { page_slug } });
      const stored = new Map(rows.map((r) => [r.section_key, r.is_enabled]));
      const data = PAGE_SECTIONS[page_slug].map(({ key, label }) => ({
        section_key: key,
        label,
        is_enabled: stored.has(key) ? stored.get(key) : true,
      }));
      sendSuccessResponse(res, data, "Page sections retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async update(req, res) {
    await Promise.all(validateToggle.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    try {
      const { page_slug, section_key, is_enabled } = req.body;
      await models.PageSectionSetting.upsert({ page_slug, section_key, is_enabled });
      sendSuccessResponse(
        res,
        { page_slug, section_key, is_enabled },
        "Page section updated successfully",
      );
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }
}

module.exports = PageSectionsController;
