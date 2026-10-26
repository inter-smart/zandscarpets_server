// Blogs sheet — create-or-update (upsert) keyed on the cleaned slug, same
// pattern as Categories. The slug is also MetaData.blog_id, so it is the one
// stable identity of a post. The sheet comes from a legacy export, so most of
// this file is cleanup: trimming, HTML entity decoding, paragraph wrapping,
// slug repair and SEO fallbacks (MetaData requires title/description/keywords).
// Images are NOT uploaded here: the files are placed manually in
// uploads/blog_images/ and this validator only checks they exist.

const fs = require("fs");
const path = require("path");
const { messages } = require("../messages");
const { generateSlug } = require("../../../../utils/slugHelper");
const { isBlankRow, isExampleRow, trimOrUndefined, lookupKey } = require("./shared");
const config = require("../config/blogs.config");

const BLOG_IMAGE_FOLDER = "blog_images";
const ALLOWED_IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const PLACEHOLDER_ALT = new Set(["image", "asa"]);
const MAX_SHORT_TEXT = 255;
const ALLOWED_STATUS = ["Enabled", "Disabled"];

const NAMED_ENTITIES = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…",
  bull: "•", middot: "·", laquo: "«", raquo: "»", copy: "©", reg: "®", trade: "™", deg: "°",
  euro: "€", pound: "£", eacute: "é", egrave: "è", agrave: "à", aacute: "á", iacute: "í",
  oacute: "ó", uacute: "ú", ccedil: "ç", ntilde: "ñ",
};
// Left encoded inside article HTML — decoding them would change the markup.
const STRUCTURAL = new Set(["amp", "lt", "gt"]);

const err = (rowNumber, column, code, params) => ({
  row: rowNumber,
  column,
  severity: "error",
  code,
  message: messages[code](params || {}),
});

const warn = (rowNumber, column, code, params) => ({
  row: rowNumber,
  column,
  severity: "warning",
  code,
  message: messages[code](params || {}),
});

// Cells can arrive as rich-text/hyperlink objects, or Dates (ExcelJS), or,
// after the Redis round-trip at commit time, plain strings.
const cellText = (value) => {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
    if (value.text !== undefined) return cellText(value.text);
    if (value.result !== undefined) return cellText(value.result);
  }
  return String(value);
};

const decodeEntities = (text, { keepStructural = false } = {}) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (keepStructural && [38, 60, 62].includes(code)) return match;
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    const name = body.toLowerCase();
    if (keepStructural && STRUCTURAL.has(name)) return match;
    return NAMED_ENTITIES[name] ?? match;
  });

// Single-line fields: decode (twice, for double-encoded cells), collapse
// whitespace, trim. Blank -> undefined.
const cleanLine = (value) => {
  let text = cellText(value);
  text = decodeEntities(decodeEntities(text));
  text = text.replace(/\s+/g, " ").trim();
  return text === "" ? undefined : text;
};

const BLOCK_HTML = /<\/?(p|h[1-6]|ul|ol|li|div|br|table|blockquote)\b/i;

// Article body: decode entities (except &amp; &lt; &gt;), then one <p> per
// non-empty line. Cells that already contain block-level HTML are left alone.
const cleanContent = (value) => {
  const text = decodeEntities(cellText(value), { keepStructural: true }).replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim();
  if (!text) return undefined;
  if (BLOCK_HTML.test(text)) return text;
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join("\n");
};

// "https://www.site.com/blog-details/ the-guide" -> "the-guide"; a pasted
// title falls through generateSlug like any other text.
const cleanSlug = (value, title) => {
  let text = cleanLine(value) || "";
  if (/^https?:\/\//i.test(text)) {
    text = text.replace(/\s+/g, "").replace(/\/+$/, "");
    text = text.slice(text.lastIndexOf("/") + 1);
  }
  return generateSlug(text) || generateSlug(title);
};

const parsePostedDate = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = trimOrUndefined(cellText(value));
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : date;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

const truncateKeywords = (text) => {
  if (text.length <= MAX_SHORT_TEXT) return { text, truncated: false };
  const cut = text.slice(0, MAX_SHORT_TEXT);
  const lastComma = cut.lastIndexOf(",");
  return { text: (lastComma > 0 ? cut.slice(0, lastComma) : cut).trim(), truncated: true };
};

async function validateBlogs(rows, { models, transaction }) {
  const errors = [];
  const warnings = [];
  const normalizedRows = [];

  const existing = await models.Blogs.findAll({ attributes: ["id", "slug", "media_path"], transaction });
  const existingBySlugKey = new Map(existing.map((b) => [lookupKey(b.slug), b]));

  const liveRows = rows.filter((row) => !isExampleRow(row, config.columns[0].key) && !isBlankRow(row, config.columns));

  const seenTitleKeys = new Map(); // title key -> rowNumber
  const seenSlugKeys = new Map(); // slug key -> rowNumber

  liveRows.forEach((row) => {
    const rowNumber = row.__rowNumber;
    const rowErrors = [];

    const title = cleanLine(row.title);
    if (!title) {
      rowErrors.push(err(rowNumber, "Title", "REQUIRED_FIELD", { column: "Title" }));
    } else if (title.length > MAX_SHORT_TEXT) {
      rowErrors.push(err(rowNumber, "Title", "TEXT_TOO_LONG", { column: "Title", max: MAX_SHORT_TEXT }));
    }

    const statusRaw = cleanLine(row.status);
    const status = ALLOWED_STATUS.find((s) => s.toLowerCase() === (statusRaw || "").toLowerCase());
    if (!statusRaw) {
      rowErrors.push(err(rowNumber, "Status", "REQUIRED_FIELD", { column: "Status" }));
    } else if (!status) {
      rowErrors.push(err(rowNumber, "Status", "INVALID_ENUM", { column: "Status", value: statusRaw, allowed: ALLOWED_STATUS }));
    }

    // Test data left in the legacy export: skip it quietly, with a warning.
    if (title && status === "Disabled" && title.toLowerCase() === "testing") {
      warnings.push(warn(rowNumber, "Title", "BLOG_TEST_POST_SKIPPED", { value: title }));
      return;
    }

    const content = cleanContent(row.description);
    if (!content) rowErrors.push(err(rowNumber, "Description", "REQUIRED_FIELD", { column: "Description" }));

    const excerpt = cleanLine(row.small_description);
    if (!excerpt) rowErrors.push(err(rowNumber, "Small Description(Blog Page)", "REQUIRED_FIELD", { column: "Small Description(Blog Page)" }));

    const postedAt = parsePostedDate(row.posted_date);
    if (!trimOrUndefined(cellText(row.posted_date)) && !(row.posted_date instanceof Date)) {
      rowErrors.push(err(rowNumber, "Posted Date", "REQUIRED_FIELD", { column: "Posted Date" }));
    } else if (!postedAt) {
      rowErrors.push(err(rowNumber, "Posted Date", "INVALID_DATE", { column: "Posted Date", value: cellText(row.posted_date) }));
    }

    // Image: name must be a bare file name; a file that isn't on disk yet is
    // a warning (post imported inactive), not an error.
    const imageName = cleanLine(row.image);
    let mediaPath;
    let imageMissing = false;
    if (!imageName) {
      rowErrors.push(err(rowNumber, "Image", "REQUIRED_FIELD", { column: "Image" }));
    } else if (path.basename(imageName) !== imageName || !ALLOWED_IMAGE_EXT.has(path.extname(imageName).toLowerCase())) {
      rowErrors.push(err(rowNumber, "Image", "BLOG_IMAGE_BAD_NAME", { value: imageName }));
    } else if (fs.existsSync(path.join(process.cwd(), "uploads", BLOG_IMAGE_FOLDER, imageName))) {
      mediaPath = `uploads/${BLOG_IMAGE_FOLDER}/${imageName}`;
    } else {
      imageMissing = true;
      warnings.push(warn(rowNumber, "Image", "BLOG_IMAGE_NOT_FOUND", { value: imageName }));
    }

    // Blank or placeholder alt text falls back to the title (the admin form requires alt text).
    let mediaAlt = cleanLine(row.image_alt_text);
    if (mediaAlt && PLACEHOLDER_ALT.has(mediaAlt.toLowerCase())) mediaAlt = undefined;
    if (!mediaAlt && title) mediaAlt = title.slice(0, MAX_SHORT_TEXT);
    if (mediaAlt && mediaAlt.length > MAX_SHORT_TEXT) {
      rowErrors.push(err(rowNumber, "Image Alt Text", "TEXT_TOO_LONG", { column: "Image Alt Text", max: MAX_SHORT_TEXT }));
    }

    const slug = title ? cleanSlug(row.canonical_name, title) : "";
    if (title && !slug) rowErrors.push(err(rowNumber, "Canonical Name", "INVALID_SLUG", { column: "Canonical Name", value: cleanLine(row.canonical_name) || title }));

    if (title) {
      const titleKey = lookupKey(title);
      if (seenTitleKeys.has(titleKey)) {
        rowErrors.push(err(rowNumber, "Title", "BLOG_DUPLICATE_IN_FILE", { column: "Title", value: title, otherRow: seenTitleKeys.get(titleKey) }));
      } else {
        seenTitleKeys.set(titleKey, rowNumber);
      }
    }
    if (slug) {
      const slugKey = lookupKey(slug);
      if (seenSlugKeys.has(slugKey)) {
        // A duplicate title already reported the same two rows.
        if (!rowErrors.some((e) => e.code === "BLOG_DUPLICATE_IN_FILE")) {
          rowErrors.push(err(rowNumber, "Canonical Name", "BLOG_DUPLICATE_IN_FILE", { column: "Canonical Name", value: slug, otherRow: seenSlugKeys.get(slugKey) }));
        }
      } else {
        seenSlugKeys.set(slugKey, rowNumber);
      }
    }

    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }

    // SEO fallbacks: MetaData requires all three.
    const metaTitle = (cleanLine(row.meta_title) || title).slice(0, MAX_SHORT_TEXT);
    const metaDescription = cleanLine(row.meta_description) || excerpt;
    const keywords = truncateKeywords(
      (cellText(row.meta_keyword).split(",").map((k) => cleanLine(k)).filter(Boolean).join(", ")) || title,
    );
    if (keywords.truncated) warnings.push(warn(rowNumber, "Meta Keyword", "BLOG_KEYWORDS_TRUNCATED"));

    const existingBlog = existingBySlugKey.get(lookupKey(slug));
    const isActive = status === "Enabled";

    normalizedRows.push({
      rowNumber,
      mode: existingBlog ? "update" : "create",
      existingId: existingBlog ? existingBlog.id : null,
      existingHasImage: Boolean(existingBlog && existingBlog.media_path),
      slug,
      title,
      title_ar: title,
      excerpt,
      excerpt_ar: excerpt,
      content,
      content_ar: content,
      media_path: mediaPath,
      image_missing: imageMissing,
      media_alt: mediaAlt,
      media_alt_ar: mediaAlt,
      published_at: postedAt,
      is_active: isActive,
      meta_title: metaTitle,
      meta_description: metaDescription,
      meta_keywords: keywords.text,
    });
  });

  return { errors, warnings, normalizedRows };
}

module.exports = { validateBlogs };
