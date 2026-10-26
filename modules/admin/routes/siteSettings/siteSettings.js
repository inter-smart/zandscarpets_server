const express = require('express');
const Controller = require('../../http/controllers/SiteSettings/SiteSettingsController');
const { createUploadMiddleware } = require('../../http/middleware/multerMiddleware');
const authMiddleware = require('../../http/middleware/authMiddleware');

const router = express.Router();

const uploadFields = [
  { name: 'header_logo_media_path' },
  { name: 'footer_logo_media_path' },
];
const upload = createUploadMiddleware('site-settings', uploadFields);

router.use(authMiddleware({ module: "settings" }));
router.get("/", Controller.get);
router.put("/:id", upload, Controller.update);

module.exports = router;

