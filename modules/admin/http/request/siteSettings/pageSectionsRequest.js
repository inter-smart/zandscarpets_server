const { body, query } = require('express-validator');
const { PAGE_SECTIONS, isValidPageSection } = require('../../../../../database/seeders/pageSections');

const validatePageSlug = [
    query('page_slug')
        .isString().withMessage('page_slug is required')
        .isIn(Object.keys(PAGE_SECTIONS)).withMessage('Unknown page'),
];

const validateToggle = [
    body('page_slug')
        .isString().withMessage('page_slug is required')
        .isIn(Object.keys(PAGE_SECTIONS)).withMessage('Unknown page'),
    body('section_key')
        .isString().withMessage('section_key is required')
        .custom((value, { req }) => isValidPageSection(req.body.page_slug, value))
        .withMessage('Unknown section for this page'),
    body('is_enabled').isBoolean().withMessage('is_enabled must be a boolean').toBoolean(),
];

module.exports = { validatePageSlug, validateToggle };
