const { body } = require("express-validator");
const { message } = require("./sampleRequestMessages");

const PHONE_PATTERN = /^[0-9\s\-()+]{7,20}$/;
const SLUG = /^[a-z0-9-]+$/i;

// Same rules as the contact form for name / email / phone; the category and product are slugs
// (checked against the catalog in the service).
const validationRequestPost = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage((_, { req }) => message(req, "nameRequired"))
    .bail()
    .isLength({ min: 2 })
    .withMessage((_, { req }) => message(req, "nameMin"))
    .bail()
    .isLength({ max: 100 })
    .withMessage((_, { req }) => message(req, "nameMax")),
  body("phone")
    .trim()
    .notEmpty()
    .withMessage((_, { req }) => message(req, "phoneRequired"))
    .bail()
    .matches(PHONE_PATTERN)
    .withMessage((_, { req }) => message(req, "phoneInvalid")),
  body("email")
    .trim()
    .notEmpty()
    .withMessage((_, { req }) => message(req, "emailRequired"))
    .bail()
    .isEmail()
    .withMessage((_, { req }) => message(req, "emailInvalid"))
    .customSanitizer((value) => String(value).toLowerCase()),
  body("company_name")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 100 })
    .withMessage((_, { req }) => message(req, "companyMax")),
  body("category")
    .trim()
    .notEmpty()
    .withMessage((_, { req }) => message(req, "categoryRequired"))
    .bail()
    .matches(SLUG)
    .withMessage((_, { req }) => message(req, "categoryInvalid")),
  body("product")
    .trim()
    .notEmpty()
    .withMessage((_, { req }) => message(req, "productRequired"))
    .bail()
    .matches(SLUG)
    .withMessage((_, { req }) => message(req, "productInvalid")),
  body("recaptcha_token")
    .notEmpty()
    .withMessage((_, { req }) => message(req, "recaptchaRequired")),
];

module.exports = { validationRequestPost };
