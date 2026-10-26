const express = require("express");
const Controller = require("../../http/controllers/details/mediaController");
const authMiddleware = require("../../http/middleware/authMiddleware");
const { createUploadMiddleware } = require("../../http/middleware/multerMiddleware");
const { MAX_VIDEO_SIZE_BYTES } = require("../../http/controllers/details/mediaLimits");

const router = express.Router();

// The outer multer ceiling has to fit the larger of the two kind limits
// (video); the controller enforces the tighter 1MB image limit itself,
// since multer can't vary its limit by mimetype within one instance.
const upload = createUploadMiddleware(
  "detail-media",
  [{ name: "file" }, { name: "thumbnail" }],
  { maxFileSizeBytes: MAX_VIDEO_SIZE_BYTES },
);

router.use(authMiddleware({ module: "catalog" }));
router.get("/", Controller.list);
router.post("/cleanup-orphans", Controller.cleanupOrphans);
router.get("/:id", Controller.getById);
router.post("/", upload, Controller.create);
router.patch("/:id", Controller.update);
router.delete("/:id", Controller.destroy);

module.exports = router;
