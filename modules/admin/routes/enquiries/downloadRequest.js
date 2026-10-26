const express = require("express");
const Controller = require("../../http/controllers/enquiries/downloadRequestController");
const authMiddleware = require("../../http/middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware({ module: "leads" }));
router.get("/", Controller.list);
router.get("/:id", Controller.getById);
router.delete("/:id", Controller.destroy);

module.exports = router;
