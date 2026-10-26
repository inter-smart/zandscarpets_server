const { body, param } = require("express-validator");
const { MODULE_KEYS, ACCESS_LEVELS } = require("../../../../../config/permissionModules");

const nameRule = () =>
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters");

// permissions: { [moduleKey]: "view" | "manage" }  (omit a module for no access)
const permissionsRule = () =>
  body("permissions")
    .optional()
    .custom((value) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error("permissions must be an object of module → access");
      }
      for (const [key, access] of Object.entries(value)) {
        if (!MODULE_KEYS.includes(key)) throw new Error(`Unknown module "${key}"`);
        if (!ACCESS_LEVELS.includes(access)) {
          throw new Error(`Access for "${key}" must be one of: ${ACCESS_LEVELS.join(", ")}`);
        }
      }
      return true;
    });

const descriptionRule = () =>
  body("description").optional({ nullable: true }).isString().isLength({ max: 1000 });

const validationRequestPost = [nameRule(), descriptionRule(), permissionsRule()];
const validationRequestUpdate = [nameRule().optional(), descriptionRule(), permissionsRule()];
const validateId = [param("id").isInt({ min: 1 }).withMessage("ID must be a positive integer")];

module.exports = { validationRequestPost, validationRequestUpdate, validateId };
