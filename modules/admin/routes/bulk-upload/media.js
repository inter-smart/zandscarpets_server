const express = require("express");
const authMiddleware = require("../../http/middleware/authMiddleware");
const Controller = require("../../http/controllers/bulkUpload/mediaController");

const router = express.Router();

router.use(authMiddleware({ module: "bulk_upload" }));
router.get("/", Controller.list);
router.post("/", Controller.upload);

module.exports = router;
