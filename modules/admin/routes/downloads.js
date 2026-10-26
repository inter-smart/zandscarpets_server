const express = require("express");
const Controller = require("../http/controllers/downloads/downloadsController");
const { createUploadMiddleware } = require("../http/middleware/multerMiddleware");
const authMiddleware = require("../http/middleware/authMiddleware");

const router = express.Router();

// PDFs only, same ceiling as the product data sheet (10MB)
const upload = createUploadMiddleware("downloads", [{ name: "file_path" }], {
  onlyPdf: true,
  maxFileSizeBytes: 10 * 1024 * 1024,
});

router.use(authMiddleware({ module: "downloads" }));
router.get("/", Controller.list);
router.get("/:id", Controller.getById);
router.post("/", upload, Controller.create);
router.put("/:id", upload, Controller.update);
router.delete("/:id", Controller.destroy);

module.exports = router;
