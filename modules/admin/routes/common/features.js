const express = require("express");
const Controller = require("../../http/controllers/common/commonFeaturesController");
const authMiddleware = require("../../http/middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware({ module: "shared_blocks" }));
router.get("/", Controller.list);
router.get("/:id", Controller.getById);
router.post("/", Controller.create);
router.put("/:id", Controller.update);
router.delete("/:id", Controller.destroy);

module.exports = router;
