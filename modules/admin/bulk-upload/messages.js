// Central error/warning message catalog for the bulk-upload feature. One
// entry per rule so wording stays consistent across every validator and the
// generated instructions sheet (spec §11 "maintainability"). Every builder
// returns a plain string; callers attach { row, column, severity } around it.

const quote = (value) => `"${value}"`;

const messages = {
  REQUIRED_FIELD: ({ column }) => `${column} is required but empty`,

  DUPLICATE_IN_FILE: ({ column, value, otherRow }) =>
    `${column} ${quote(value)} is the same as row ${otherRow} in this file`,

  DUPLICATE_IN_DB: ({ column, value }) =>
    `${column} ${quote(value)} is already in use`,

  INVALID_ENUM: ({ column, value, allowed }) =>
    `Allowed values for ${column}: ${allowed.join(", ")}. You entered ${quote(value)}`,

  INVALID_BOOLEAN: ({ column, value }) =>
    `${column} must be TRUE or FALSE. You entered ${quote(value)}`,

  INVALID_NUMBER: ({ column, value }) =>
    `${column} must be a number. You entered ${quote(value)}`,

  INVALID_SLUG: ({ column, value }) =>
    `${column} must be lowercase with hyphens only, no spaces. You entered ${quote(value)}`,

  INVALID_COLOR_CODE: ({ value }) =>
    `${quote(value)} is not a valid color code. Use the format #RRGGBB, e.g. #A0522D`,

  REF_NOT_FOUND: ({ column, value, suggestion }) =>
    `${column} ${quote(value)} was not found${suggestion ? `. Did you mean ${quote(suggestion)}?` : ""}`,

  PARENT_NOT_ABOVE_CHILD: ({ column, value }) =>
    `${column} ${quote(value)} must appear in a row above this one`,

  PARENT_CYCLE: ({ value }) =>
    `${quote(value)} cannot be its own ancestor — check the parent chain for a loop`,

  MEDIA_NOT_FOUND: ({ column, value }) =>
    `${column}: file not found: ${value}`,

  MEDIA_WRONG_FOLDER: ({ column, value, expectedFolder }) =>
    `${column}: ${quote(value)} must be a path under ${expectedFolder}/`,

  LIST_IMAGE_FALLBACK: () => `list_image is blank, main_image will be used instead`,

  CATEGORY_LEVEL_GAP: ({ column, previousColumn }) =>
    `${column} is filled in but ${previousColumn} is blank — fill in ${previousColumn} first, or clear ${column}`,

  COLOR_CODE_IGNORED: ({ attributeTitle, attributeType }) =>
    `Attribute ${quote(attributeTitle)} is type ${quote(attributeType || "text")} — the |#RRGGBB color code was ignored`,

  ATTRIBUTE_COLUMN_ONE_SIDED: ({ filledColumn, blankColumn }) =>
    `${filledColumn} is filled in but ${blankColumn} is blank — fill in both, or leave both blank for no attributes`,

  ATTRIBUTE_COLUMN_COUNT_MISMATCH: ({ namesCount, valuesCount }) =>
    `Attributes lists ${namesCount} item(s) but Values for Each Attribute lists ${valuesCount} — these must match 1-for-1, separated by ; in the same order`,

  ATTRIBUTES_IGNORED_ON_UPDATE: () =>
    `attribute_titles is ignored when updating an existing product — attributes aren't changed via bulk upload; edit them from the product's screen instead`,

  LABELS_IGNORED_ON_UPDATE: () =>
    `Features/Tags/Specifications are ignored when updating an existing product — labels aren't changed via bulk upload; edit them from the product's screen instead`,

  TOO_MANY_VARIANT_COMBINATIONS: ({ count, max }) =>
    `These attributes would generate ${count} variant combinations, more than the suggested ${max} per product — consider splitting this product into a smaller set of options`,

  DUPLICATE_ATTRIBUTE_IN_ROW: ({ attributeTitle }) =>
    `Attribute ${quote(attributeTitle)} is listed more than once in Attributes — list each attribute only once`,

  DUPLICATE_VALUE_IN_GROUP: ({ attributeTitle, value }) =>
    `Value ${quote(value)} is listed more than once for attribute ${quote(attributeTitle)} — list each value only once`,

  DUPLICATE_TITLE_IN_SHEET: ({ value, otherRow }) =>
    `title ${quote(value)} is the same as row ${otherRow}, under a different category — check this is intentional`,

  PLACEHOLDER_TEXT_IGNORED: ({ column, value }) =>
    `${column} ${quote(value)} looks like placeholder text, not a real category — it was treated as blank`,

  ATTRIBUTE_VALUE_REF_FORMAT: ({ value }) =>
    `${quote(value)} must be in the form Attribute=Value, e.g. Size=120cm`,

  ATTRIBUTE_VALUE_COUNT_MISMATCH: ({ productSlug, expected, got }) =>
    `Product ${quote(productSlug)} uses ${expected.length} attribute(s) (${expected.join(", ")}) but this row has ${got} value(s)`,

  ATTRIBUTE_VALUE_NOT_OWNED: ({ attributeTitle, value }) =>
    `${quote(value)} does not belong to attribute ${quote(attributeTitle)}`,

  ATTRIBUTE_NOT_USED_BY_PRODUCT: ({ productSlug, attributeTitle }) =>
    `Product ${quote(productSlug)} does not use attribute ${quote(attributeTitle)}`,

  VARIANT_COMBINATION_DUPLICATE: ({ productSlug, otherRow }) =>
    `This attribute-value combination for product ${quote(productSlug)} is the same as row ${otherRow}`,

  ATTRIBUTE_VALUE_MISSING_FOR_TYPE: ({ attributeType, missingFields }) =>
    `Attribute type ${quote(attributeType)} requires: ${missingFields.join(", ")}`,

  TEXT_TOO_LONG: ({ column, max }) => `${column} must be at most ${max} characters`,

  INVALID_DATE: ({ column, value }) =>
    `${column} must be a date in the form YYYY-MM-DD. You entered ${quote(value)}`,

  BLOG_DUPLICATE_IN_FILE: ({ column, value, otherRow }) =>
    `${column} ${quote(value)} is the same as row ${otherRow} in this file — keep only one of the two posts`,

  BLOG_IMAGE_BAD_NAME: ({ value }) =>
    `Image ${quote(value)} must be a file name ending in .jpg, .jpeg, .png or .webp, with no folders`,

  BLOG_IMAGE_NOT_FOUND: ({ value }) =>
    `Image ${quote(value)} was not found in uploads/blog_images/ — the post will be imported as inactive until the image is added`,

  BLOG_TEST_POST_SKIPPED: ({ value }) =>
    `${quote(value)} looks like a test post and was skipped`,

  BLOG_KEYWORDS_TRUNCATED: () => `Meta Keyword was longer than 255 characters and was cut`,

  OUTDATED_TEMPLATE: ({ got, expected }) =>
    `This template is out of date (version ${got}, current is ${expected}). Download a fresh template and re-fill your data`,

  EMPTY_FILE: () => `The uploaded file has no data rows`,

  WRONG_FILE_TYPE: () => `Only .xlsx files are accepted`,

  MISSING_SHEET: ({ sheetName }) => `Expected a sheet named ${quote(sheetName)} but it was not found`,

  MISSING_COLUMN: ({ column }) => `Expected column ${quote(column)} was not found — don't rename, reorder or delete columns`,

  ROW_CAP_EXCEEDED: ({ cap }) =>
    `This file has more rows than the limit of ${cap}. Please split it into parts of up to ${cap} rows`,

  VALIDATION_EXPIRED: () => `This validation has expired. Please re-upload and validate the file again`,

  IMPORT_ALREADY_RUNNING: ({ entity }) =>
    `Another import for ${entity} is already in progress. Please wait for it to finish`,
};

module.exports = { messages };
