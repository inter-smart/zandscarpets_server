const express = require("express");
const Controller = require("../../http/controllers/products/productsMediaController");
const authMiddleware = require("../../http/middleware/authMiddleware");
const {
  createUploadMiddleware,
} = require("../../http/middleware/multerMiddleware");

const router = express.Router();

const uploadFields = [{ name: "media_path" }, { name: "thumbnail" }];

const upload = createUploadMiddleware("products-media", uploadFields);

router.use(authMiddleware({ module: "catalog" }));
router.get("/", Controller.list);
router.get("/:id", Controller.getById);
router.post("/", upload, Controller.create);
router.put("/:id", upload, Controller.update);
router.delete("/:id", Controller.destroy);

module.exports = router;
