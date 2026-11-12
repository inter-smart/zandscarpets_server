const { body } = require("express-validator");
const { message } = require("./downloadRequestMessages");

const PHONE_PATTERN = /^[0-9\s\-()+]{7,20}$/;
const SLUG = /^[a-z0-9-]+$/i;

// Same rules as the contact form / sample request for name, phone, email
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
  // Exactly one of download_id (Downloads master list) or product (a product's own datasheet)
  // must be present — the request is either "send me this file" or "send me this product's sheet".
  body("download_id")
    .optional({ values: "falsy" })
    .bail()
    .isInt({ min: 1 })
    .withMessage((_, { req }) => message(req, "downloadInvalid")),
  body("product")
    .optional({ values: "falsy" })
    .trim()
    .matches(SLUG)
    .withMessage((_, { req }) => message(req, "productInvalid")),
  body("download_id").custom((value, { req }) => {
    const hasDownload = !!value;
    const hasProduct = !!req.body.product;
    if (hasDownload === hasProduct) {
      throw new Error(message(req, "downloadRequired"));
    }
    return true;
  }),
  body("recaptcha_token")
    .notEmpty()
    .withMessage((_, { req }) => message(req, "recaptchaRequired")),
];

module.exports = { validationRequestPost };
