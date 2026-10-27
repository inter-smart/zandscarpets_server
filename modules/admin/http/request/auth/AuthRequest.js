const { body, param } = require("express-validator");

// Register Validation
const validationRequestPost = [
  body("username")
    .notEmpty().withMessage("Username is required")
    .isLength({ min: 3, max: 50 }).withMessage("Username must be between 3 and 50 characters")
    .matches(/^[a-zA-Z0-9_]+$/).withMessage("Username can only contain letters, numbers, and underscores")
    .trim().toLowerCase(),

  body("email")
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Invalid email format")
    .normalizeEmail(),

  body("password")
    .notEmpty().withMessage("Password is required")
    .isLength({ min: 8, max: 128 }).withMessage("Password must be between 8 and 128 characters"),
];

// Login Validation
const validationLogin = [
  body("username")
    .notEmpty().withMessage("Username is required")
    .trim().toLowerCase(),

  body("password")
    .notEmpty().withMessage("Password is required"),
];

// ID parameter validation
const validateId = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("ID must be a positive integer"),
];

// Forgot Password Validation
const validationForgotPassword = [
  body("email")
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Invalid email format")
    .normalizeEmail(),
];

// OTP Verification Validation
const validationVerifyOtp = [
  body("email")
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Invalid email format")
    .normalizeEmail(),

  body("otp")
    .notEmpty().withMessage("OTP is required")
    .isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits")
    .isNumeric().withMessage("OTP must contain only digits"),
];

// Reset Password Validation
const validationResetPassword = [
  body("email")
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Invalid email format")
    .normalizeEmail(),

  body("resetToken")
    .notEmpty().withMessage("Reset token is required"),

  body("password")
    .notEmpty().withMessage("Password is required")
    .isLength({ min: 8, max: 128 }).withMessage("Password must be between 8 and 128 characters"),
];

module.exports = {
  validationRequestPost,
  validationLogin,
  validateId,
  validationForgotPassword,
  validationVerifyOtp,
  validationResetPassword,
};
