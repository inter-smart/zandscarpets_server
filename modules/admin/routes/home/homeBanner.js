const express = require("express");
const Controller = require("../../http/controllers/home/homeBannerController");
const { createUploadMiddleware } = require("../../http/middleware/multerMiddleware");
const authMiddleware = require("../../http/middleware/authMiddleware");

const router = express.Router();

const uploadFields = [{ name: "media_path" }, { name: "thumbnail" }];
const upload = createUploadMiddleware("home-banner", uploadFields, {
  maxFileSizeBytes: 10 * 1024 * 1024, // room for video banners
});

router.use(authMiddleware({ module: "website_pages" }));
router.get("/", Controller.list);
router.get("/:id", Controller.getById);
router.post("/", upload, Controller.create);
router.put("/:id", upload, Controller.update);
router.delete("/:id", Controller.destroy);

module.exports = router;
