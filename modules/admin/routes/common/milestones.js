const express = require("express");
const Controller = require("../../http/controllers/common/commonMilestonesController");
const { createUploadMiddleware } = require("../../http/middleware/multerMiddleware");
const authMiddleware = require("../../http/middleware/authMiddleware");

const router = express.Router();

const uploadFields = [{ name: "media_path" }];
const upload = createUploadMiddleware("common-milestones", uploadFields);

router.use(authMiddleware({ module: "shared_blocks" }));
router.get("/", Controller.list);
router.get("/:id", Controller.getById);
router.post("/", upload, Controller.create);
router.put("/:id", upload, Controller.update);
router.delete("/:id", Controller.destroy);

module.exports = router;
