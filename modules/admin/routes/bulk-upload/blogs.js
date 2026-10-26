const { buildBulkUploadRouter } = require("../../bulk-upload/routerFactory");
const Controller = require("../../http/controllers/bulkUpload/blogsController");

module.exports = buildBulkUploadRouter(Controller);
