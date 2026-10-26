const express = require('express');
const Controller = require('../../http/controllers/home/homeCmsController');
const authMiddleware = require('../../http/middleware/authMiddleware');

const { createUploadMiddleware } = require('../../http/middleware/multerMiddleware');

const router = express.Router();

const upload = createUploadMiddleware('home-cms', [
  { name: 'cta_media_path' },
  { name: 'space_bg_image' },
]);

router.use(authMiddleware({ module: "website_pages" }));
router.get("/", Controller.get);
router.put("/:id", upload, Controller.update);

module.exports = router;
