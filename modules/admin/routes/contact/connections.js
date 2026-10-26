const express = require("express");
const Controller = require("../../http/controllers/contact/connectionsController");
const { createUploadMiddleware } = require("../../http/middleware/multerMiddleware");
const authMiddleware = require("../../http/middleware/authMiddleware");

const router = express.Router();

const uploadFields = [{ name: "icon_media_path" }];
const upload = createUploadMiddleware("connections", uploadFields);

router.use(authMiddleware({ module: "website_pages" }));
router.get("/", Controller.list);
router.get("/:id", Controller.getById);
router.post("/", upload, Controller.create);
router.put("/:id", upload, Controller.update);
router.delete("/:id", Controller.destroy);

module.exports = router;
