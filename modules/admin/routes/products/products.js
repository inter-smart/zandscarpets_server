const express = require("express");
const Controller = require("../../http/controllers/products/productsController");
const { createUploadMiddleware } = require("../../http/middleware/multerMiddleware");
const authMiddleware = require("../../http/middleware/authMiddleware");

const router = express.Router();

const upload = createUploadMiddleware("products", [{ name: "list_media_path" }]);

router.use(authMiddleware({ module: "catalog" }));
router.get("/active", Controller.getActive);
router.get("/", Controller.list);
router.get("/:id", Controller.getById);
router.post("/", upload, Controller.create);
router.put("/:id", upload, Controller.update);
router.delete("/:id", Controller.destroy);

module.exports = router;
