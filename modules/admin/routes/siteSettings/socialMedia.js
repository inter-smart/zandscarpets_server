const express = require("express");
const Controller = require("../../http/controllers/SiteSettings/SocialMediaController");
const {
  createUploadMiddleware,
} = require("../../http/middleware/multerMiddleware");
const authMiddleware = require("../../http/middleware/authMiddleware");

const router = express.Router();

const uploadFields = [{ name: "media_path" }];

const upload = createUploadMiddleware("social-media", uploadFields, {
  iconOnly: true,
  maxFileSizeBytes: 100 * 1024,
});

router.use(authMiddleware({ module: "settings" }));
router.get("/", Controller.list);
router.get("/:id", Controller.getById);
router.post("/", upload, Controller.create);
router.put("/:id", upload, Controller.update);
router.delete("/:id", Controller.destroy);

module.exports = router;