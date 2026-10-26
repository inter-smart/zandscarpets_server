const express = require("express");
const Controller = require("../../http/controllers/products/variantsController");
const authMiddleware = require("../../http/middleware/authMiddleware");
const {
  createUploadMiddleware,
} = require("../../http/middleware/multerMiddleware");

const router = express.Router();

const upload = createUploadMiddleware("product-variants", [{ name: "media_path" }]);

router.use(authMiddleware({ module: "catalog" }));

// Fixed paths must be declared before "/:id".
router.post("/generate", Controller.generate);
router.get("/match", Controller.match);
router.get("/active", Controller.getActive);

router.get("/", Controller.list);
router.get("/:id", Controller.getById);
router.post("/", upload, Controller.create);
router.put("/:id", upload, Controller.update);
router.delete("/:id", Controller.destroy);

module.exports = router;
