const { body } = require("express-validator");
const { message } = require("./contactEnquiryMessages");

// Same rules as the storefront form (name >= 4, valid email, 7-20 char phone, requirements);
// messages follow `?lang=` (en / ar).
const PHONE_PATTERN = /^[0-9\s\-()+]{7,20}$/;

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
  body("email")
    .trim()
    .notEmpty()
    .withMessage((_, { req }) => message(req, "emailRequired"))
    .bail()
    .isEmail()
    .withMessage((_, { req }) => message(req, "emailInvalid"))
    // lower-case only: normalizeEmail would also strip dots from Gmail addresses
    .customSanitizer((value) => String(value).toLowerCase()),
  body("phone")
    .trim()
    .notEmpty()
    .withMessage((_, { req }) => message(req, "phoneRequired"))
    .bail()
    .matches(PHONE_PATTERN)
    .withMessage((_, { req }) => message(req, "phoneInvalid")),
  body("requirements")
    .trim()
    .notEmpty()
    .withMessage((_, { req }) => message(req, "requirementsRequired"))
    .bail()
    .isLength({ max: 2000 })
    .withMessage((_, { req }) => message(req, "requirementsMax")),
  body("recaptcha_token")
    .notEmpty()
    .withMessage((_, { req }) => message(req, "recaptchaRequired")),
];

module.exports = { validationRequestPost };
