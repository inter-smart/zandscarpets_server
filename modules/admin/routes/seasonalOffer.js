const express = require("express");
const Controller = require("../http/controllers/seasonalOfferController");
const authMiddleware = require("../http/middleware/authMiddleware");
const { createUploadMiddleware } = require("../http/middleware/multerMiddleware");

const router = express.Router();

const upload = createUploadMiddleware(
  "seasonal-offer",
  [{ name: "media_path" }, { name: "mobile_media_path" }, { name: "badge_image" }],
  { imageOnly: true, maxFileSizeBytes: 2 * 1024 * 1024 },
);

router.use(authMiddleware({ module: "site_elements" }));
router.get("/", Controller.get);
router.put("/:id", upload, Controller.update);

module.exports = router;
