const express = require('express');
const Controller = require('../../http/controllers/about/aboutCmsController');
const { createUploadMiddleware } = require('../../http/middleware/multerMiddleware');
const authMiddleware = require('../../http/middleware/authMiddleware');

const router = express.Router();

const uploadFields = [
  { name: 'media_path' },
  { name: 'about_core_media_path' },
  { name: 'industry_media_path' },
];
const upload = createUploadMiddleware('about-cms', uploadFields);

router.use(authMiddleware({ module: "website_pages" }));
router.get("/", Controller.get);
router.put("/:id", upload, Controller.update);

module.exports = router;
