const { body, param } = require("express-validator");

// Field-rule factories (not shared chain instances — express-validator chains are
// stateful, so reusing one object across the create/update rule sets would mean
// `.optional()` on one array mutates the exact same chain used by the other).
const usernameRule = () =>
  body("username")
    .isLength({ min: 3, max: 50 })
    .withMessage("Username must be between 3 and 50 characters")
    // .matches(/^[a-zA-Z0-9_]+$/)
    // .withMessage("Username can only contain letters, numbers, and underscores")
    .trim()
    .toLowerCase();

const emailRule = () =>
  body("email").isEmail().withMessage("Invalid email format").normalizeEmail();

const passwordRule = () =>
  body("password")
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters");
const roleRule = () =>
  body("role_id").optional().isInt({ min: 1 }).withMessage("role_id must be a valid role id");

const isActiveRule = () =>
  body("is_active")
    .optional()
    .isBoolean()
    .withMessage("is_active must be a boolean");

// Create — username/email/password are required
const validationRequestPost = [
  usernameRule().notEmpty().withMessage("Username is required"),
  emailRule().notEmpty().withMessage("Email is required"),
  passwordRule().notEmpty().withMessage("Password is required"),
  roleRule(),
  isActiveRule(),
];

// Update — every field optional, but validated when present so a partial
// PUT/PATCH can't smuggle in a weak password or malformed email.
const validationRequestUpdate = [
  usernameRule().optional(),
  emailRule().optional(),
  passwordRule().optional(),
  roleRule(),
  isActiveRule(),
];

const validateId = [
  param("id").isInt({ min: 1 }).withMessage("ID must be a positive integer"),
];

module.exports = {
  validationRequestPost,
  validationRequestUpdate,
  validateId,
};
