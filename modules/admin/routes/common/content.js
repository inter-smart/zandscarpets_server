const express = require("express");
const Controller = require("../../http/controllers/common/commonContentController");
const { createUploadMiddleware } = require("../../http/middleware/multerMiddleware");
const authMiddleware = require("../../http/middleware/authMiddleware");

const router = express.Router();

const upload = createUploadMiddleware(
  "common-content",
  [{ name: "how_section_media_path" }, { name: "how_section_thumbnail" }],
  { maxFileSizeBytes: 10 * 1024 * 1024 }, // room for video
);

router.use(authMiddleware({ module: "shared_blocks" }));
router.get("/", Controller.get);
router.put("/:id", upload, Controller.update);

module.exports = router;
