const express = require("express");
const Controller = require("../http/controllers/editorImages/editorImageController");
const { createUploadMiddleware } = require("../http/middleware/multerMiddleware");
const authMiddleware = require("../http/middleware/authMiddleware");

const router = express.Router();

// images inserted in rich text editors (one file per request, field `file`); raster images only
const upload = createUploadMiddleware("editor-content", [{ name: "file" }], { imageOnly: true });

router.use(authMiddleware());
router.post("/upload", upload, Controller.upload);

module.exports = router;
