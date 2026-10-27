const { body, param } = require("express-validator");

const validationRequestPost = [
  body("product_id").notEmpty().withMessage("Product is required").isInt({ min: 1 }).withMessage("Product ID must be an integer"),

  body("media_path").notEmpty().withMessage("Media path is required").isString().withMessage("Media path must be a string"),
  body("media_alt").notEmpty().withMessage("Media alt is required").isString().withMessage("Media alt must be a string"),
  body("media_alt_ar").notEmpty().withMessage("Media alt (Arabic) is required").isString().withMessage("Media alt (Arabic) must be a string"),

  body("title").notEmpty().withMessage("Title is required").isString().withMessage("Title must be a string"),
  body("title_ar").notEmpty().withMessage("Title (Arabic) is required").isString().withMessage("Title (Arabic) must be a string"),

  body("sub_title").notEmpty().withMessage("Sub title is required").isString().withMessage("Sub title must be a string"),
  body("sub_title_ar").notEmpty().withMessage("Sub title (Arabic) is required").isString().withMessage("Sub title (Arabic) must be a string"),

  body("is_active").optional().isBoolean().withMessage("Active flag must be a boolean"),
];

const validateId = [
  param("id").isInt({ min: 1 }).withMessage("ID must be an integer"),
];

module.exports = {
  validationRequestPost,
  validateId,
};
