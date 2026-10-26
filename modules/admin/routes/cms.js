const express = require("express");
const Controller = require("../http/controllers/common/CmsOrderStatusController");
const authMiddleware = require("../http/middleware/authMiddleware");

const router = express.Router();

// This generic status/sort-order/flag route serves many resources, so the permission module is
// resolved from the :resource param. Unknown resources fall through to the controller's own
// "Unknown resource" validation but still require the strictest module ("settings").
const RESOURCE_MODULE = {
  "social-media": "settings",
  "footer-media": "site_elements",
  "floating-icons": "site_elements",
  "ads-banner": "site_elements",
  pages: "website_pages",
  "home-banner": "website_pages",
  "home-brands": "website_pages",
  "home-testimonials": "website_pages",
  "home-side-images": "website_pages",
  "core-values": "website_pages",
  history: "website_pages",
  "about-industries": "website_pages",
  messages: "website_pages",
  connections: "website_pages",
  faqs: "masters",
  industry: "masters",
  "our-features": "masters",
  materials: "masters",
  "work-plan": "masters",
  "common-milestones": "shared_blocks",
  "common-features": "shared_blocks",
  "common-how-it-works": "shared_blocks",
  projects: "projects",
  services: "services",
  "process-steps": "services",
  "product-categories": "catalog",
  "product-highlights": "catalog",
  "product-labels": "catalog",
  attributes: "catalog",
  "attribute-values": "catalog",
  "product-media": "catalog",
  "product-variants": "catalog",
  products: "catalog",
  "detail-fields": "catalog",
  blogs: "blogs",
  "blog-tags": "blogs",
  downloads: "downloads",
};

const authByResource = (req, res, next) =>
  authMiddleware({ module: RESOURCE_MODULE[req.params.resource] ?? "settings" })(req, res, next);

router.use("/:resource/:id", authByResource);
router.patch("/:resource/:id/status", Controller.updateStatus);
router.patch("/:resource/:id/sort-order", Controller.updateSortOrder);
router.patch("/:resource/:id/navbar", Controller.updateNavbar);
router.patch("/:resource/:id/home", Controller.updateHome);
router.patch("/:resource/:id/footer", Controller.updateFooter);

module.exports = router;
