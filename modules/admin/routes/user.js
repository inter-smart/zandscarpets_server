const express = require("express");
const Controller = require("../http/controllers/admin/UserController");
const authMiddleware = require("../http/middleware/authMiddleware");

const router = express.Router();

// User management is admin-only.
router.use(authMiddleware({ module: "users" }));

router.get("/", Controller.list);
router.get("/:id", Controller.getById);
router.post("/", Controller.create);
router.put("/:id", Controller.update);
router.delete("/:id", Controller.destroy);

module.exports = router;
