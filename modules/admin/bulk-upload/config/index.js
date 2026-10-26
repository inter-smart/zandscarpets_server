// Registry of per-entity sheet configs.

const categories = require("./categories.config");
const attributes = require("./attributes.config");
const attributeValues = require("./attributeValues.config");
const products = require("./products.config");
const productVariants = require("./productVariants.config");
const productMain = require("./productMain.config");
const blogs = require("./blogs.config");

module.exports = {
  blogs,
  categories,
  attributes,
  attributeValues,
  products,
  productVariants,
  productMain,
};
