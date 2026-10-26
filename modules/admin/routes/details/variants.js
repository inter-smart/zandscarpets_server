const express = require("express");
const Controller = require("../../http/controllers/details/mappingsController");
const authMiddleware = require("../../http/middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware({ module: "catalog" }));

router.get("/:variantId", Controller.listResolvedForVariant);
router.post("/:variantId/fields/:fieldId/customize", Controller.customize);
router.post("/:variantId/fields/:fieldId/hide", Controller.hideForVariant);
router.post("/:variantId/fields/:fieldId/show-again", Controller.showAgain);
router.post("/:variantId/fields/:fieldId/revert", Controller.revert);
router.post("/:variantId/fields/:fieldId/promote", Controller.promote);
router.post("/:variantId/items/:itemId/exclude", Controller.addExclusion);
router.delete("/:variantId/items/:itemId/exclude", Controller.removeExclusion);

module.exports = router;
