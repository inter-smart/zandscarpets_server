const express = require("express");
const Controller = require("../../http/controllers/Masters/ProjectsController");
const { createUploadMiddleware } = require("../../http/middleware/multerMiddleware");
const authMiddleware = require("../../http/middleware/authMiddleware");

const router = express.Router();

// project_media isn't listed here since it's a gallery field (many files under
// one fieldname) — createUploadMiddleware only normalizes single-file fields;
// the controller reads gallery uploads straight off req.files.project_media.
const uploadFields = [{ name: "thumbnail" }, { name: "media_path" }];
const upload = createUploadMiddleware("projects", uploadFields);

router.use(authMiddleware({ module: "projects" }));
router.get("/active", Controller.getActiveProjects);
router.get("/", Controller.list);
router.get("/:id", Controller.getById);
router.post("/", upload, Controller.create);
router.put("/:id", upload, Controller.update);
router.delete("/:id", Controller.destroy);

module.exports = router;
