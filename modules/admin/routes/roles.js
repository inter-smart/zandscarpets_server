const express = require("express");
const Controller = require("../http/controllers/admin/RoleController");
const authMiddleware = require("../http/middleware/authMiddleware");

const router = express.Router();

// /options feeds the role dropdown on the Users form, so the "users" module may read it.
router.get("/options", authMiddleware({ module: "users" }), Controller.options);
router.get("/modules", authMiddleware({ module: "roles" }), Controller.modules);
router.get("/", authMiddleware({ module: "roles" }), Controller.list);
router.get("/:id", authMiddleware({ module: "roles" }), Controller.getById);
router.post("/", authMiddleware({ module: "roles" }), Controller.create);
router.put("/:id", authMiddleware({ module: "roles" }), Controller.update);
router.delete("/:id", authMiddleware({ module: "roles" }), Controller.destroy);

module.exports = router;
