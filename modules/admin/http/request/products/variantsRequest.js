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

const optionalJsonArray = (field, label) =>
  body(field)
    .optional({ checkFalsy: true })
    .custom(isJsonArray)
    .withMessage(`${label} must be a JSON array`);

const productId = body("product_id")
  .notEmpty()
  .withMessage("Product is required")
  .isInt({ min: 1 })
  .withMessage("Product is required");

const validationRequestPost = [
  productId,
  // One value id per attribute the product uses (combination key).
  optionalJsonArray("attribute_value_ids", "Attribute value ids"),
  optionalString("label", "Label"),
  optionalString("label_ar", "Label (Arabic)"),
  // Auto-generated from product + attribute values when left blank.
  optionalString("sku", "SKU"),
  // optional: a variant without its own images shows the product's
  optionalString("media_path", "Media path"),
  optionalJsonArray("gallery_meta", "Gallery"),
  optionalString("media_alt", "Media alt"),
  optionalString("media_alt_ar", "Media alt (Arabic)"),
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
];

const generateRequest = [
  productId,
  body("selections")
    .custom(isJsonArray)
    .withMessage("Selections must be a JSON array"),
];

const validateId = [
  param("id").isInt({ min: 1 }).withMessage("ID must be an integer"),
];

module.exports = { validationRequestPost, generateRequest, validateId };
