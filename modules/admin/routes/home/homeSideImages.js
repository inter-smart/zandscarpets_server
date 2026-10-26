const express = require("express");
const Controller = require("../../http/controllers/home/homeSideImagesController");
const { createUploadMiddleware } = require("../../http/middleware/multerMiddleware");
const authMiddleware = require("../../http/middleware/authMiddleware");

const router = express.Router();

const uploadFields = [
  { name: "before_media_path" },
  { name: "after_media_path" },
];
const upload = createUploadMiddleware("home-side-images", uploadFields);

router.use(authMiddleware({ module: "website_pages" }));
router.get("/", Controller.list);
router.get("/:id", Controller.getById);
router.post("/", upload, Controller.create);
router.put("/:id", upload, Controller.update);
router.delete("/:id", Controller.destroy);

module.exports = router;
