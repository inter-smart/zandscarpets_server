const { ApiResponse } = require("../../traits/response");
const { HTTP_STATUS, RESPONSE_MESSAGES } = require("../../traits/constants");
const { ErrorHandler } = require("../../traits/errorHandler");
const service = require("./SearchService");

class SearchController {
  /*
   * @route   GET /api/frontend/search?q=grass&type=all|products|categories|blogs&limit=5&page=1&view=full
   * @desc    Site search over active products, categories and published blog posts
   * @access  Public
   */
  static async search(req, res) {
    try {
      const { data } = await service.search(req);
      return ApiResponse.success(res, {
        message: RESPONSE_MESSAGES.SUCCESS.DATA_RETRIEVED,
        data,
        status: HTTP_STATUS.OK,
      });
    } catch (error) {
      return ErrorHandler.handleControllerError(error, res, "searchController.search");
    }
  }
}

module.exports = SearchController;
