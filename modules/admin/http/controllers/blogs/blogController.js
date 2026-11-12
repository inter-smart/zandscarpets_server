const { Op } = require("sequelize");
const { sequelize, models } = require("../../../../../database/models");
const {
  handleFileUploadUpdate,
  handleFileUploadStore,
  deleteOldFile,
} = require("../../middleware/multerMiddleware");
const {
  sendSuccessResponse,
  sendErrorResponse,
  sendNotFoundError,
  sendValidationError,
} = require("../../traits/responseHandler");
const { paginate } = require("../../traits/datatablePaginationHelper");
const { validationRequestPost, validateId } = require("../../request/blogs/blogRequest");
const { validationResult } = require("express-validator");
const { parsePickerQuery, searchCondition, pickerPageResult } = require("../../traits/pickerPagination");
const { generateSlug, generateUniqueSlug, assertNoDuplicate } = require("../../../../../utils/slugHelper");

const { BASE_URL } = require("../../../../../constants");

const dataModel = models.Blogs;
const fileFields = ["media_path"];

const relatedInclude = [
  { model: models.BlogTags, as: "tags", attributes: ["id", "title", "title_ar"], through: { attributes: [] } },
  { model: models.ProductCategories, as: "categories", attributes: ["id", "title", "title_ar"], through: { attributes: [] } },
  {
    model: models.BlogImages,
    as: "images",
    attributes: ["id", "media_path", "media_alt", "media_alt_ar", "sort_order"],
    separate: true,
    order: [["sort_order", "ASC"], ["id", "ASC"]],
  },
  {
    model: models.BlogRelated,
    as: "related_links",
    attributes: ["related_blog_id", "sort_order"],
    separate: true,
    order: [["sort_order", "ASC"]],
  },
];

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

// null = not sent (leave the links alone); otherwise the wanted ids
const parseIds = (value) => {
  if (value === undefined) return null;
  return parseJsonArray(value)
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
};

// Gallery files travel as req.files["gallery_file__<tempId>"] (one per new image), keyed by the
// client's tempId (same approach as the projects gallery).
const galleryFilePath = (req, tempId) => {
  const file = req.files?.[`gallery_file__${tempId}`]?.[0];
  return file ? file.path.replace(/\\/g, "/") : null;
};

// Reconciles the gallery rows with the final state the client sent in `gallery_meta`: a JSON array
// of `{ id, sort_order, media_alt, media_alt_ar }` for kept images and `{ tempId, sort_order,
// media_alt, media_alt_ar }` for new ones. Rows no longer listed are removed and returned so
// their files can be cleaned up after the transaction commits.
const syncGallery = async (req, blog, t) => {
  // no `gallery_meta` in the request: the gallery is not being edited, leave it as it is
  if (req.body.gallery_meta === undefined) return [];
  const meta = parseJsonArray(req.body.gallery_meta);
  delete req.body.gallery_meta;

  const existing = await models.BlogImages.findAll({ where: { blog_id: blog.id }, transaction: t });
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
      await models.BlogImages.create({ blog_id: blog.id, media_path, ...fields }, { transaction: t });
    }
  }

  const removed = existing.filter((row) => !keptIds.has(row.id));
  for (const row of removed) await row.destroy({ transaction: t });
  return removed;
};

// Replaces the hand-picked related posts (order = the order of `ids`); a post can't relate to itself
const syncRelated = async (blog, ids, t) => {
  if (ids === null) return;
  const valid = new Set(await existingIds(models.Blogs, ids.filter((id) => id !== blog.id)));
  const ordered = [...new Set(ids)].filter((id) => valid.has(id));
  await models.BlogRelated.destroy({ where: { blog_id: blog.id }, transaction: t });
  if (ordered.length) {
    await models.BlogRelated.bulkCreate(
      ordered.map((related_blog_id, sort_order) => ({ blog_id: blog.id, related_blog_id, sort_order })),
      { transaction: t },
    );
  }
};

const deleteGalleryFiles = (rows) =>
  Promise.all(rows.map((row) => row.media_path).filter(Boolean).map((p) => deleteOldFile(p)));

// Uploaded files that ended up unused because the request failed
const discardUploads = (req) =>
  Promise.all(
    Object.values(req.files || {})
      .flat()
      .map((file) => deleteOldFile(file.path.replace(/\\/g, "/"))),
  );

// Drops ids that don't exist so a stale form can't break the links
const existingIds = async (Model, ids) => {
  if (!ids?.length) return [];
  const rows = await Model.findAll({ where: { id: { [Op.in]: ids } }, attributes: ["id"] });
  return rows.map((row) => row.id);
};

class BlogController {
  /*
   * @route   POST /api/backend/blogs/upload-image   (multipart, field `file`)
   * @desc    Stores an image used inside the article editor and returns where it can be loaded from
   */
  static async uploadImage(req, res) {
    try {
      const file = req.files?.file?.[0];
      if (!file) {
        return sendValidationError(res, [{ path: "file", msg: "Image file is required" }]);
      }
      const relative = file.path.replace(/\\/g, "/");
      return sendSuccessResponse(res, { path: relative, url: `${BASE_URL}/${relative}` }, "Image uploaded successfully", 201);
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async list(req, res) {
    try {
      const where = {};
      if (req.query.status === "active") where.is_active = true;
      else if (req.query.status === "inactive") where.is_active = false;

      const result = await paginate(dataModel, req, {
        where,
        // the list doesn't need the article bodies
        attributes: { exclude: ["content", "content_ar"] },
        order: [["published_at", "DESC"], ["id", "DESC"]],
        searchFields: ["title", "title_ar", "slug", "author_name"],
      });

      sendSuccessResponse(res, result, "Blog list retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  /*
   * @route   GET /api/backend/blogs/active
   * @desc    Blog posts (id = slug, title) for pickers, e.g. the Meta Data screen
   */
  static async getActive(req, res) {
    try {
      // Paged mode (picker dropdowns): lean slug/title rows, searched server-side.
      const paging = parsePickerQuery(req.query);
      if (paging) {
        const where = { is_active: true, slug: { [Op.ne]: null } };
        if (req.query.id) where.slug = String(req.query.id);
        const search = searchCondition(["title", "slug"], paging.search);
        if (search) Object.assign(where, search);
        const { rows, count } = await dataModel.findAndCountAll({
          where,
          order: [["published_at", "DESC"], ["id", "DESC"]],
          attributes: ["slug", "title"],
          limit: paging.limit,
          offset: paging.offset,
        });
        const data = rows.map((row) => ({ id: row.slug, title: row.title }));
        return sendSuccessResponse(res, pickerPageResult(data, count, paging), "Blog posts retrieved successfully");
      }

      const rows = await dataModel.findAll({
        where: { is_active: true },
        attributes: ["slug", "title", "title_ar"],
        order: [["published_at", "DESC"]],
      });
      const posts = rows
        .filter((row) => row.slug)
        .map((row) => ({ id: row.slug, title: row.title, title_ar: row.title_ar }));
      return sendSuccessResponse(res, posts, "Blog posts retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async getById(req, res) {
    await Promise.all(validateId.map((validation) => validation.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    try {
      const item = await dataModel.findByPk(req.params.id, { include: relatedInclude });
      if (!item) return sendNotFoundError(res, "Blog");
      sendSuccessResponse(res, item, "Blog retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async create(req, res) {
    await Promise.all(validationRequestPost.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await discardUploads(req);
      return sendValidationError(res, errors.array());
    }

    if (!req.body.media_path) {
      await discardUploads(req);
      return sendValidationError(res, [{ path: "media_path", msg: "Hero image is required" }]);
    }

    const t = await sequelize.transaction();
    try {
      handleFileUploadStore(req, fileFields);

      const categoryIds = parseIds(req.body.category_ids);
      const tagIds = parseIds(req.body.tag_ids);
      const relatedIds = parseIds(req.body.related_ids);
      delete req.body.category_ids;
      delete req.body.tag_ids;
      delete req.body.related_ids;

      if (!req.body.published_at) req.body.published_at = new Date();

      if (!req.body.slug || !String(req.body.slug).trim()) {
        req.body.slug = await generateUniqueSlug(dataModel, req.body.title, { transaction: t });
      } else {
        req.body.slug = generateSlug(req.body.slug);
        await assertNoDuplicate(dataModel, { field: "slug", value: req.body.slug, transaction: t });
      }

      const item = await dataModel.create(req.body, { transaction: t });
      await syncGallery(req, item, t);

      if (categoryIds?.length) {
        await item.setCategories(await existingIds(models.ProductCategories, categoryIds), { transaction: t });
      }
      if (tagIds?.length) {
        await item.setTags(await existingIds(models.BlogTags, tagIds), { transaction: t });
      }
      await syncRelated(item, relatedIds, t);

      await t.commit();

      const created = await dataModel.findByPk(item.id, { include: relatedInclude });
      sendSuccessResponse(res, created, "Blog created successfully", 201);
    } catch (error) {
      await t.rollback();
      await discardUploads(req);
      return sendErrorResponse(res, error);
    }
  }

  static async update(req, res) {
    await Promise.all([...validateId, ...validationRequestPost].map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await discardUploads(req);
      return sendValidationError(res, errors.array());
    }

    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const item = await dataModel.findByPk(id, { transaction: t });
      if (!item) {
        await t.rollback();
        await discardUploads(req);
        return sendNotFoundError(res, "Blog");
      }

      await handleFileUploadUpdate(req, item, fileFields);
      // no new hero sent: keep the current one (the multer step turns an unchanged path into undefined)
      if (!req.body.media_path) delete req.body.media_path;

      const categoryIds = parseIds(req.body.category_ids);
      const tagIds = parseIds(req.body.tag_ids);
      const relatedIds = parseIds(req.body.related_ids);
      delete req.body.category_ids;
      delete req.body.tag_ids;
      delete req.body.related_ids;

      const removedImages = await syncGallery(req, item, t);

      if (!req.body.published_at) delete req.body.published_at;

      const nextSlug = req.body.slug;
      if (!nextSlug || !String(nextSlug).trim()) {
        // an existing post keeps its URL when the title changes (links and SEO rows use the slug)
        req.body.slug =
          item.slug ||
          (await generateUniqueSlug(dataModel, req.body.title || item.title, { excludeId: id, transaction: t }));
      } else {
        req.body.slug = generateSlug(nextSlug);
        if (item.slug !== req.body.slug) {
          await assertNoDuplicate(dataModel, { field: "slug", value: req.body.slug, excludeId: id, transaction: t });
        }
      }

      const previousSlug = item.slug;
      await item.update(req.body, { transaction: t });

      // SEO meta rows reference a blog by its slug string (no FK), so follow a slug change
      if (previousSlug && previousSlug !== req.body.slug) {
        await models.MetaData.update(
          { blog_id: req.body.slug },
          { where: { type: "blog", blog_id: previousSlug }, transaction: t },
        );
      }

      if (categoryIds !== null) {
        await item.setCategories(await existingIds(models.ProductCategories, categoryIds), { transaction: t });
      }
      if (tagIds !== null) {
        await item.setTags(await existingIds(models.BlogTags, tagIds), { transaction: t });
      }
      await syncRelated(item, relatedIds, t);

      await t.commit();
      await deleteGalleryFiles(removedImages);

      const updated = await dataModel.findByPk(id, { include: relatedInclude });
      sendSuccessResponse(res, updated, "Blog updated successfully");
    } catch (error) {
      await t.rollback();
      await discardUploads(req);
      return sendErrorResponse(res, error);
    }
  }

  static async destroy(req, res) {
    await Promise.all(validateId.map((validation) => validation.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const item = await dataModel.findByPk(id, {
        include: [{ model: models.BlogImages, as: "images" }],
        transaction: t,
      });
      if (!item) {
        await t.rollback();
        return sendNotFoundError(res, "Blog");
      }

      const images = item.images || [];
      for (const row of images) await row.destroy({ transaction: t });

      // a soft-deleted post keeps no category / tag links
      await item.setCategories([], { transaction: t });
      await item.setTags([], { transaction: t });
      await models.BlogRelated.destroy({
        where: { [Op.or]: [{ blog_id: item.id }, { related_blog_id: item.id }] },
        transaction: t,
      });
      // drop its SEO meta row so the slug can be reused later
      if (item.slug) {
        await models.MetaData.destroy({ where: { type: "blog", blog_id: item.slug }, transaction: t });
      }
      await item.destroy({ transaction: t });

      await t.commit();

      if (item.media_path) await deleteOldFile(item.media_path);
      await deleteGalleryFiles(images);

      sendSuccessResponse(res, { id }, "Blog deleted successfully");
    } catch (error) {
      await t.rollback();
      return sendErrorResponse(res, error);
    }
  }
}

module.exports = BlogController;
