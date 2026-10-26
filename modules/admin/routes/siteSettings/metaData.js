const express = require("express");
const Controller = require("../../http/controllers/SiteSettings/metaDataController");
const authMiddleware = require("../../http/middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware({ module: "seo" }));
router.get("/", Controller.list);
router.get("/:id", Controller.getById);
router.post("/", Controller.create);
router.put("/:id", Controller.update);

module.exports = router;
