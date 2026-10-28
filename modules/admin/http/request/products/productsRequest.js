const { body, param } = require("express-validator");

// FormData sends arrays as JSON strings, so accept either form.
const isJsonArray = (value) => {
  if (Array.isArray(value)) return true;
  if (typeof value !== "string") return false;
  try {
    return Array.isArray(JSON.parse(value));
  } catch (_) {
    return false;
  }
};

const optionalString = (field, label) =>
  body(field)
    .optional({ checkFalsy: true })
    .isString()
    .withMessage(`${label} must be a string`);

const requiredString = (field, label) =>
  body(field)
    .notEmpty()
    .withMessage(`${label} is required`)
    .isString()
    .withMessage(`${label} must be a string`);

const optionalJsonArray = (field, label) =>
  body(field)
    .optional({ checkFalsy: true })
    .custom(isJsonArray)
    .withMessage(`${label} must be a JSON array`);

const validationRequestPost = [
  body("product_category_id")
    .notEmpty()
    .withMessage("Category is required")
    .isInt({ min: 1 })
    .withMessage("Category must be a valid ID"),

  requiredString("title", "Title"),
  requiredString("title_ar", "Title (Arabic)"),
  requiredString("short_description", "Short description"),
  requiredString("short_description_ar", "Short description (Arabic)"),
  requiredString("product_description", "Product description"),
  requiredString("product_description_ar", "Product description (Arabic)"),

  optionalString("media_alt", "Main media alt"),
  optionalString("media_alt_ar", "Main media alt (Arabic)"),
  optionalString("list_media_path", "List media"),
  optionalString("list_media_alt", "List media alt"),
  optionalString("list_media_alt_ar", "List media alt (Arabic)"),

  body("price")
    .optional({ checkFalsy: true })
    .isDecimal({ decimal_digits: "0,2" })
    .withMessage("Price must be a number with up to 2 decimals")
    .custom((v) => Number(v) >= 0)
    .withMessage("Price cannot be negative"),

  optionalJsonArray("label_ids", "Label ids"),
  optionalJsonArray("related_product_ids", "Related product ids"),
  optionalJsonArray("attribute_ids", "Attribute ids"),
  optionalJsonArray("gallery_meta", "Gallery"),

  body("badge_label_id")
    .optional({ checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage("Badge must be a valid label ID"),

  body("sort_order")
    .notEmpty()
    .withMessage("Sort order is required")
    .isInt({ min: 0 })
    .withMessage("Sort order must be an integer"),
  body("is_active")
    .notEmpty()
    .withMessage("Is active is required")
    .isBoolean()
    .withMessage("Is active must be a boolean"),
  body("list_in_navbar")
    .optional({ checkFalsy: true })
    .isBoolean()
    .withMessage("List in navbar must be a boolean"),
  body("show_in_home")
    .optional()
    .isBoolean()
    .withMessage("Show in home must be a boolean"),
  body("show_in_footer")
    .optional()
    .isBoolean()
    .withMessage("Show in footer must be a boolean"),
];

const validateId = [
  param("id").isInt({ min: 1 }).withMessage("ID must be an integer"),
];

module.exports = { validationRequestPost, validateId };
