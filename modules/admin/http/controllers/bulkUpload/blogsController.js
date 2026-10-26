const { buildBulkUploadController } = require("../../../bulk-upload/controllerFactory");
const config = require("../../../bulk-upload/config/blogs.config");
const { validateBlogs } = require("../../../bulk-upload/validators/blogsValidator");
const { importBlogs } = require("../../../bulk-upload/importer");

module.exports = buildBulkUploadController({
  entity: "blogs",
  config,
  validateFn: validateBlogs,
  importFn: importBlogs,
});
