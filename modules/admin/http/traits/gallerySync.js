const { deleteOldFile } = require("../middleware/multerMiddleware");

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
};

// Gallery files travel as req.files["gallery_file__<tempId>"] (one per new image), keyed by the
// client's tempId (same approach as the blog / projects galleries).
const galleryFilePath = (req, tempId) => {
  const file = req.files?.[`gallery_file__${tempId}`]?.[0];
  return file ? file.path.replace(/\\/g, "/") : null;
};

// Reconciles an image table (`Model`, rows keyed by `foreignKey` = `ownerId`) with the final state
// the client sent in `gallery_meta`: a JSON array of `{ id, sort_order, media_alt, media_alt_ar }`
// for kept images and `{ tempId, sort_order, media_alt, media_alt_ar }` for new ones. Rows no
// longer listed are removed and returned so their files can be cleaned up after the transaction
// commits.
const syncGallery = async (req, { Model, foreignKey, ownerId }, t) => {
  // no `gallery_meta` in the request: the gallery is not being edited, leave it as it is
  if (req.body.gallery_meta === undefined) return [];
  const meta = parseJsonArray(req.body.gallery_meta);
  delete req.body.gallery_meta;

  const existing = await Model.findAll({ where: { [foreignKey]: ownerId }, transaction: t });
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const keptIds = new Set();

  for (const entry of meta) {
    const fields = {
      sort_order: Number.isInteger(entry?.sort_order) ? entry.sort_order : 0,
      media_alt: entry?.media_alt ?? null,
      media_alt_ar: entry?.media_alt_ar ?? null,
    };

    if (entry?.id && existingById.has(Number(entry.id))) {
      const row = existingById.get(Number(entry.id));
      keptIds.add(row.id);
      await row.update(fields, { transaction: t });
      continue;
    }

    if (entry?.tempId) {
      const media_path = galleryFilePath(req, entry.tempId);
      if (!media_path) continue;
      await Model.create({ [foreignKey]: ownerId, media_path, ...fields }, { transaction: t });
    }
  }

  const removed = existing.filter((row) => !keptIds.has(row.id));
  for (const row of removed) await row.destroy({ transaction: t });
  return removed;
};

const deleteGalleryFiles = (rows) =>
  Promise.all(rows.map((row) => row.media_path).filter(Boolean).map((p) => deleteOldFile(p)));

// Uploaded gallery files that ended up unused because the request failed
const discardGalleryUploads = (req) =>
  Promise.all(
    Object.entries(req.files || {})
      .filter(([field]) => field.startsWith("gallery_file__"))
      .flatMap(([, files]) => files)
      .map((file) => deleteOldFile(file.path.replace(/\\/g, "/"))),
  );

module.exports = { syncGallery, deleteGalleryFiles, discardGalleryUploads };
