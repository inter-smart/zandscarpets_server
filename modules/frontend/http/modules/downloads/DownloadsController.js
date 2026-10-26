const { ApiResponse } = require("../../traits/response");
const { HTTP_STATUS, RESPONSE_MESSAGES } = require("../../traits/constants");
const { ErrorHandler } = require("../../traits/errorHandler");
const service = require("./DownloadsService");

class DownloadsController {
  /*
   * @route   GET /api/frontend/downloads
   * @desc    Downloads page: banner, page scripts and the paginated list of active downloadable files (?page, ?limit)
   * @access  Public
   */
  static async page(req, res) {
    try {
      const { data } = await service.page(req);
      return ApiResponse.success(res, {
        message: RESPONSE_MESSAGES.SUCCESS.DATA_RETRIEVED,
        data,
        status: HTTP_STATUS.OK,
      });
    } catch (error) {
      return ErrorHandler.handleControllerError(error, res, "DownloadsController.page");
    }
  }
}

module.exports = DownloadsController;
