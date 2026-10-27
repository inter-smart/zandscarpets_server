const express = require("express");
const router = express.Router();
const Controller = require("../http/modules/search/SearchController");

router.get("/", Controller.search);

module.exports = router;
