const express = require('express');
const Controller = require('../../http/controllers/contact/contactCmsController');
const { createUploadMiddleware } = require('../../http/middleware/multerMiddleware');
const authMiddleware = require('../../http/middleware/authMiddleware');

const router = express.Router();

const uploadFields = [
  { name: 'phone_icon_media_path' },
  { name: 'email_icon_media_path' },
  { name: 'office_icon_media_path' },
];
const upload = createUploadMiddleware('contact-cms', uploadFields);

router.use(authMiddleware({ module: "website_pages" }));
router.get("/", Controller.get);
router.put("/:id", upload, Controller.update);

module.exports = router;
