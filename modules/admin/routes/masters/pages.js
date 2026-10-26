const express = require("express");
const Controller = require("../../http/controllers/Masters/PagesController");
const authMiddleware = require("../../http/middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware({ module: "website_pages" }));
router.get("/active", Controller.getActivePages);
router.get("/", Controller.list);
router.get("/:id", Controller.getById);
router.post("/", Controller.create);
router.put("/:id", Controller.update);
router.delete("/:id", Controller.destroy);

module.exports = router;
