// Every per-entity spreadsheet route (template/validate/commit) is wired
// identically — only the controller differs. The memory-storage multer
// instance is shared too: the uploaded spreadsheet is a temporary
// validation input, not persisted media, so there's no reason to write it
// under uploads/ the way createUploadMiddleware does for real files.

const express = require("express");
const multer = require("multer");
const authMiddleware = require("../http/middleware/authMiddleware");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function buildBulkUploadRouter(controller) {
  const router = express.Router();
  router.use(authMiddleware({ module: "bulk_upload" }));
  router.get("/template", controller.template);
  router.post("/validate", upload.single("file"), controller.validate);
  router.post("/commit", controller.commit);
  return router;
}

module.exports = { buildBulkUploadRouter };
