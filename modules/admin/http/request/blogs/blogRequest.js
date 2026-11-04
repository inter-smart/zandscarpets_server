const { body, param } = require("express-validator");

const validationRequestPost = [
  body("title").trim().notEmpty().withMessage("Title is required").isString().withMessage("Title must be a string"),
  body("title_ar").trim().notEmpty().withMessage("Arabic title is required").isString().withMessage("Arabic title must be a string"),
  body("slug").optional({ nullable: true }).isString().withMessage("Slug must be a string"),
  body("excerpt").trim().notEmpty().withMessage("Excerpt is required").isString().withMessage("Excerpt must be a string"),
  body("excerpt_ar").trim().notEmpty().withMessage("Arabic excerpt is required").isString().withMessage("Arabic excerpt must be a string"),
  body("content").notEmpty().withMessage("Content is required").isString().withMessage("Content must be a string"),
  body("content_ar").notEmpty().withMessage("Arabic content is required").isString().withMessage("Arabic content must be a string"),
  body("author_name").optional({ nullable: true }).isString().withMessage("Author must be a string"),
  body("author_name_ar").optional({ nullable: true }).isString().withMessage("Arabic author must be a string"),
  body("media_alt").optional({ nullable: true }).isString().withMessage("Hero alt text must be a string"),
  body("media_alt_ar").trim().notEmpty().withMessage("Arabic hero alt text is required").isString().withMessage("Arabic hero alt text must be a string"),
  body("published_at")
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601()
    .withMessage("Published date must be a valid date"),
  body("is_active").notEmpty().withMessage("Status is required").isBoolean().withMessage("Status must be a boolean"),
];

const validateId = [param("id").isInt({ min: 1 }).withMessage("ID must be an integer")];

module.exports = { validationRequestPost, validateId };
