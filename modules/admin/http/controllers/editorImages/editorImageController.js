const { BASE_URL } = require("../../../../../constants");
const {
  sendSuccessResponse,
  sendErrorResponse,
  sendValidationError,
} = require("../../traits/responseHandler");

class EditorImageController {
  /**
   * @route   POST /api/backend/editor-images/upload
   * @desc    Stores an image inserted in a rich text editor. `path` is the relative form to save in the
   *          HTML (the storefront API resolves it); `url` is loadable right away for the editor preview.
   */
  static async upload(req, res) {
    try {
      const file = req.files?.file?.[0];
      if (!file) {
        return sendValidationError(res, [{ path: "file", msg: "Image file is required" }]);
      }
      const relative = file.path.replace(/\\/g, "/");
      return sendSuccessResponse(
        res,
        { path: `/${relative}`, url: `${BASE_URL}/${relative}` },
        "Image uploaded successfully",
        201,
      );
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }
}

module.exports = EditorImageController;
