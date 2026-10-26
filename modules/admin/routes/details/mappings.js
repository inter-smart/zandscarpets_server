const express = require("express");
const Controller = require("../../http/controllers/details/mappingsController");
const authMiddleware = require("../../http/middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware({ module: "catalog" }));

// Product-level field management.
router.get("/products/:productId", Controller.listForProduct);
router.post("/products/:productId", Controller.addFieldToProduct);
router.put("/products/:productId/reorder", Controller.reorderFields);

router.delete("/:mappingId", Controller.removeField);

// Item management. The static "reorder" segment must be registered ahead
// of the dynamic ":itemId" route below — same precedent as
// routes/products/variants.js declaring /generate and /match ahead of /:id.
router.put("/:mappingId/items/reorder", Controller.reorderItems);
router.post("/:mappingId/items", Controller.addItem);
router.put("/:mappingId/items/:itemId", Controller.editItem);
router.delete("/items/:itemId", Controller.removeItem);

module.exports = router;
