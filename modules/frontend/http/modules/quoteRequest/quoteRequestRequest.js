const { body } = require("express-validator");
const { message } = require("./quoteRequestMessages");

// Same name/email/phone rules as the other lead-capture forms; `items` is the
// cart built on the storefront (or the fallback picker when the cart is empty).
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
    .customSanitizer((value) => String(value).toLowerCase()),
  body("phone")
    .trim()
    .notEmpty()
    .withMessage((_, { req }) => message(req, "phoneRequired"))
    .bail()
    .matches(PHONE_PATTERN)
    .withMessage((_, { req }) => message(req, "phoneInvalid")),
  body("company_name")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 100 })
    .withMessage((_, { req }) => message(req, "companyMax")),
  body("message")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 2000 })
    .withMessage((_, { req }) => message(req, "messageMax")),
  body("recaptcha_token")
    .notEmpty()
    .withMessage((_, { req }) => message(req, "recaptchaRequired")),
  body("items")
    .isArray({ min: 1, max: 50 })
    .withMessage((_, { req }) => message(req, "itemsRequired")),
  body("items.*.product_title")
    .trim()
    .notEmpty()
    .withMessage((_, { req }) => message(req, "itemProductTitleRequired")),
  body("items.*.quantity")
    .isInt({ min: 1, max: 999 })
    .withMessage((_, { req }) => message(req, "itemQuantityInvalid")),
  body("items.*.product_id").optional({ values: "null" }).isInt(),
  body("items.*.variant_id").optional({ values: "null" }).isInt(),
];

module.exports = { validationRequestPost };
