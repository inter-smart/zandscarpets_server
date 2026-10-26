const { body, param } = require("express-validator");

const requiredTextFields = ["button_text", "button_text_ar", "button_link"];

const validationRequestPost = [
  body("is_active").optional().isBoolean().withMessage("is_active must be a boolean"),
  body("auto_show_delay_seconds")
    .optional({ checkFalsy: true })
    .isInt({ min: 0, max: 60 })
    .withMessage("Auto-show delay must be between 0 and 60 seconds")
    .custom((value) => {
      const n = Number(value);
      if (n !== 0 && n < 5) {
        throw new Error("Auto-show delay must be 0 (disabled) or at least 5 seconds");
      }
      return true;
    }),
  ...requiredTextFields.map((field) =>
    body(field).trim().notEmpty().withMessage(`${field} is required`),
  ),
];

const validateId = [param("id").isInt({ min: 1 }).withMessage("ID must be an integer")];

module.exports = { validationRequestPost, validateId };
