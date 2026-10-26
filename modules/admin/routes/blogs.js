const express = require("express");
const Controller = require("../http/controllers/blogs/blogController");
const { createUploadMiddleware } = require("../http/middleware/multerMiddleware");
const authMiddleware = require("../http/middleware/authMiddleware");

const router = express.Router();

// hero image only: the gallery images arrive as `gallery_file__<tempId>` fields (see the controller)
const upload = createUploadMiddleware("blogs", [{ name: "media_path" }]);

// images dropped into the article body (one file per request, field `file`)
const uploadContentImage = createUploadMiddleware("blogs-content", [{ name: "file" }]);

router.use(authMiddleware({ module: "blogs" }));
router.get("/active", Controller.getActive);
router.post("/upload-image", uploadContentImage, Controller.uploadImage);
router.get("/", Controller.list);
router.get("/:id", Controller.getById);
router.post("/", upload, Controller.create);
router.put("/:id", upload, Controller.update);
router.delete("/:id", Controller.destroy);

module.exports = router;
