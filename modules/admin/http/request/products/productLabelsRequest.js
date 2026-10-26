const { body, param } = require("express-validator");

const validationRequestPost = [
  body("type")
    .optional({ checkFalsy: true })
    .isIn(["feature", "tag", "specification"])
    .withMessage("Type must be one of: feature, tag, specification"),
  body("title").notEmpty().withMessage("Title is required").isString().withMessage("Title must be a string"),
  body("title_ar").notEmpty().withMessage("Title (Arabic) is required").isString().withMessage("Title (Arabic) must be a string"),
  body("slug").optional({ checkFalsy: true }).isString().withMessage("Slug must be a string"),
  body("is_product_badge")
    .optional({ checkFalsy: true })
    .isBoolean()
    .withMessage("Is product badge must be a boolean"),
  body("show_in_filter")
    .optional({ checkFalsy: true })
    .isBoolean()
    .withMessage("Show in filter must be a boolean"),
  body("sort_order").notEmpty().withMessage("Sort order is required").isInt({ min: 0 }).withMessage("Sort order must be an integer"),
  body("is_active").notEmpty().withMessage("Is active is required").isBoolean().withMessage("Is active must be a boolean"),
];

const validateId = [param("id").isInt({ min: 1 }).withMessage("ID must be an integer")];

module.exports = { validationRequestPost, validateId };
