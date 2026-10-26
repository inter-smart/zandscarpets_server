const express = require("express");
const Controller = require("../http/controllers/blogs/blogCmsController");
const authMiddleware = require("../http/middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware({ module: "website_pages" }));
router.get("/", Controller.get);
router.put("/:id", Controller.update);

module.exports = router;
