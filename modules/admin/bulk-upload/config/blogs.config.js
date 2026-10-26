// Column definition for the Blogs sheet. Headers deliberately match the
// legacy "Blogs-<date>.xlsx" export so its columns can be pasted straight
// into the template. Drives both blogsValidator.js and the generated .xlsx
// template (templates.js).

module.exports = {
  entity: "blogs",
  sheetName: "Blogs",
  templateVersion: 1,
  model: "Blogs",
  acceptLegacyExport: true, // the old export has no "Blogs" sheet name or hidden Meta sheet; see parser.js
  columns: [
    { key: "legacy_id", header: "ID", required: false, type: "text", example: "1", notes: "Old system ID. For reference only, not imported" },
    { key: "title", header: "Title", required: true, type: "text", example: "Best Vinyl Flooring in Dubai" },
    {
      key: "canonical_name",
      header: "Canonical Name",
      required: false,
      type: "text",
      example: "best-vinyl-flooring-in-dubai",
      notes:
        "URL slug. Cleaned automatically (lowercased, full URLs reduced to the last part). Blank or unusable = generated from the title. An existing blog with the same slug is UPDATED",
    },
    { key: "description", header: "Description", required: true, type: "text", example: "Full article text", notes: "Article body. Line breaks become paragraphs; HTML entities such as &nbsp; are decoded" },
    { key: "small_description", header: "Small Description(Blog Page)", required: true, type: "text", example: "Short summary for the blog listing", notes: "Excerpt shown on the blog listing card" },
    {
      key: "image",
      header: "Image",
      required: true,
      type: "text",
      example: "image123.jpg",
      notes:
        "File name only (jpg, jpeg, png or webp, case-sensitive). The file must already be in the server's uploads/blog_images/ folder. If it isn't, the post is still imported but left inactive",
    },
    { key: "image_alt_text", header: "Image Alt Text", required: false, type: "text", example: "", notes: "Blank or placeholder values such as \"Image\" fall back to the Title" },
    { key: "posted_date", header: "Posted Date", required: true, type: "text", example: "2026-01-31", notes: "YYYY-MM-DD. A future date keeps the post hidden until that day" },
    { key: "status", header: "Status", required: true, type: "text", example: "Enabled", notes: "Enabled or Disabled" },
    { key: "meta_title", header: "Meta Title", required: false, type: "text", example: "", notes: "Blank = the title" },
    { key: "meta_keyword", header: "Meta Keyword", required: false, type: "text", example: "", notes: "Blank = the title. Cut to 255 characters" },
    { key: "meta_description", header: "Meta Description", required: false, type: "text", example: "", notes: "Blank = the small description" },
    { key: "other_meta_tags", header: "Other Meta Tags", required: false, type: "text", example: "", notes: "Ignored" },
  ],
};
