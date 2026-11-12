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
const {
  validationRequestPost,
  validateId,
} = require("../../request/masters/projectsRequest");
const { validationResult } = require("express-validator");
const { parsePickerQuery, searchCondition, pickerPageResult } = require("../../traits/pickerPagination");
const {
  generateSlug,
  generateUniqueSlug,
  assertNoDuplicate,
} = require("../../../../../utils/slugHelper");

const dataModel = models.Projects;
const fileFields = ["thumbnail", "media_path"];

const relatedInclude = [
  { model: models.Industry, as: "industry", attributes: ["id", "title"] },
  {
    model: models.ProductCategories,
    as: "category",
    attributes: ["id", "title"],
  },
  {
    model: dataModel,
    as: "relatedProjects",
    attributes: ["id", "title", "thumbnail"],
    through: { attributes: [] },
  },
  {
    model: models.ProjectMedia,
    as: "project_media",
    attributes: ["id", "media_type", "media_path", "thumbnail", "sort_order"],
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

const parseRelatedProjectIds = (value) => {
  if (value === undefined) return null;
  return parseJsonArray(value)
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
};

// A category only makes sense attached to a project if it's actually one of
// the categories mapped (via industry_categories) to that project's industry.
const categoryBelongsToIndustry = async (industryId, categoryId) => {
  const industry = await models.Industry.findByPk(industryId, {
    include: [
      {
        model: models.ProductCategories,
        as: "categories",
        where: { id: categoryId },
        attributes: ["id"],
        through: { attributes: [] },
      },
    ],
  });
  return Boolean(industry);
};

// Multer's upload.any() groups every uploaded file by fieldname regardless
// of whether it's in createUploadMiddleware's declared `fields` list, so a
// per-gallery-item file pair arrives as req.files["project_media_file__<tempId>"]
// / req.files["project_media_thumbnail__<tempId>"], keyed by the client's tempId.
const buildMediaFilePaths = (req, tempId) => {
  const file = req.files?.[`project_media_file__${tempId}`]?.[0];
  const thumb = req.files?.[`project_media_thumbnail__${tempId}`]?.[0];
  return {
    media_path: file ? file.path.replace(/\\/g, "/") : null,
    thumbnail: thumb ? thumb.path.replace(/\\/g, "/") : null,
  };
};

// Reconciles the project's gallery (ProjectMedia rows) against the desired
// final state the client sent in `project_media_meta`: a JSON array of
// `{ id, sort_order }` for kept existing items and `{ tempId, media_type,
// sort_order }` for new ones (whose files travel under that tempId). Rows no
// longer referenced are soft-deleted and returned so their files can be
// cleaned up (best-effort) after the transaction commits.
const syncProjectMedia = async (req, project, t) => {
  const metaItems = parseJsonArray(req.body.project_media_meta);
  delete req.body.project_media_meta;

  const existingRows = await models.ProjectMedia.findAll({
    where: { project_id: project.id },
    transaction: t,
  });
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  const keptIds = new Set();

  for (const entry of metaItems) {
    const sortOrder = Number.isInteger(entry?.sort_order) ? entry.sort_order : 0;

    if (entry?.id && existingById.has(Number(entry.id))) {
      const row = existingById.get(Number(entry.id));
      keptIds.add(row.id);
      if (row.sort_order !== sortOrder) {
        await row.update({ sort_order: sortOrder }, { transaction: t });
      }
      continue;
    }

    if (entry?.tempId && ["image", "video"].includes(entry.media_type)) {
      const { media_path, thumbnail } = buildMediaFilePaths(req, entry.tempId);
      if (!media_path) continue;
      await models.ProjectMedia.create(
        {
          project_id: project.id,
          media_type: entry.media_type,
          media_path,
          thumbnail: entry.media_type === "video" ? thumbnail : null,
          sort_order: sortOrder,
        },
        { transaction: t },
      );
    }
  }

  const removedRows = existingRows.filter((row) => !keptIds.has(row.id));
  for (const row of removedRows) {
    await row.destroy({ transaction: t });
  }

  return removedRows;
};

const deleteProjectMediaFiles = (rows) =>
  Promise.all(
    rows.flatMap((row) => [row.media_path, row.thumbnail].filter(Boolean)).map((p) => deleteOldFile(p)),
  );

class ProjectsController {
  static async list(req, res) {
    try {
      const where = {};
      const industryId = parseInt(req.query.industry_id, 10);
      if (Number.isInteger(industryId) && industryId > 0) {
        where.industry_id = industryId;
      }
      const status = req.query.status;
      if (status === "active") {
        where.is_active = true;
      } else if (status === "inactive") {
        where.is_active = false;
      }
      const showInHome = req.query.show_in_home;
      if (showInHome === "true") {
        where.is_show_in_home = true;
      } else if (showInHome === "false") {
        where.is_show_in_home = false;
      }

      const result = await paginate(dataModel, req, {
        where,
        order: [["sort_order", "ASC"]],
        searchFields: [
          "title",
          "location",
          "material_type",
          "industry.title",
          "category.title",
        ],
        include: [
          {
            model: models.Industry,
            as: "industry",
            attributes: ["title"],
            where: { is_active: true },
            required: true,
          },
          {
            model: models.ProductCategories,
            as: "category",
            attributes: ["id", "title"],
          },
        ],
      });

      sendSuccessResponse(res, result, "Project list retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async getActiveProjects(req, res) {
    try {
      const excludeId = parseInt(req.query.excludeId, 10);
      const where = { is_active: true };
      if (Number.isInteger(excludeId) && excludeId > 0) {
        where.id = { [Op.ne]: excludeId };
      }

      // Paged mode (picker dropdowns): lean id/title rows, searched server-side.
      const paging = parsePickerQuery(req.query);
      if (paging) {
        const pickedId = parseInt(req.query.id, 10);
        if (Number.isInteger(pickedId) && pickedId > 0) where.id = pickedId;
        const search = searchCondition(["title"], paging.search);
        if (search) Object.assign(where, search);
        const { rows, count } = await dataModel.findAndCountAll({
          where,
          order: [["sort_order", "ASC"], ["id", "ASC"]],
          attributes: ["id", "title"],
          limit: paging.limit,
          offset: paging.offset,
        });
        return sendSuccessResponse(res, pickerPageResult(rows, count, paging), "Project list retrieved successfully");
      }

      const result = await dataModel.findAll({
        where,
        order: [["sort_order", "ASC"]],
        attributes: ["id", "title", "thumbnail"],
      });

      sendSuccessResponse(res, result, "Project list retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async getById(req, res) {
    await Promise.all(validateId.map((validation) => validation.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    try {
      const { id } = req.params;

      const item = await dataModel.findByPk(id, { include: relatedInclude });
      if (!item) return sendNotFoundError(res, "Project");

      sendSuccessResponse(res, item, "Project retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async create(req, res) {
    await Promise.all(validationRequestPost.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    if (req.body.category_id) {
      const valid = await categoryBelongsToIndustry(
        req.body.industry_id,
        req.body.category_id,
      );
      if (!valid) {
        return sendValidationError(res, [
          {
            path: "category_id",
            msg: "Category is not mapped to the selected industry",
          },
        ]);
      }
    }

    const t = await sequelize.transaction();
    try {
      handleFileUploadStore(req, fileFields);

      const relatedProjectIds = parseRelatedProjectIds(
        req.body.related_project_ids,
      );
      delete req.body.related_project_ids;

      const slug = req.body.slug;
      if (!slug || !String(slug).trim()) {
        req.body.slug = await generateUniqueSlug(dataModel, req.body.title, {
          transaction: t,
        });
      } else {
        req.body.slug = generateSlug(slug);
        await assertNoDuplicate(dataModel, {
          field: "slug",
          value: req.body.slug,
          transaction: t,
        });
      }

      const item = await dataModel.create(req.body, { transaction: t });
      await syncProjectMedia(req, item, t);

      if (relatedProjectIds?.length) {
        await item.setRelatedProjects(relatedProjectIds, { transaction: t });
      }

      await t.commit();

      const created = await dataModel.findByPk(item.id, {
        include: relatedInclude,
      });
      sendSuccessResponse(res, created, "Project created successfully", 201);
    } catch (error) {
      await t.rollback();
      return sendErrorResponse(res, error);
    }
  }

  static async update(req, res) {
    await Promise.all(
      [...validateId, ...validationRequestPost].map((v) => v.run(req)),
    );
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());

    if (req.body.category_id) {
      const valid = await categoryBelongsToIndustry(
        req.body.industry_id,
        req.body.category_id,
      );
      if (!valid) {
        return sendValidationError(res, [
          {
            path: "category_id",
            msg: "Category is not mapped to the selected industry",
          },
        ]);
      }
    }

    const t = await sequelize.transaction();
    try {
      const { id } = req.params;
      const item = await dataModel.findByPk(id, { transaction: t });
      if (!item) {
        await t.rollback();
        return sendNotFoundError(res, "Project");
      }

      await handleFileUploadUpdate(req, item, fileFields);

      const relatedProjectIds = parseRelatedProjectIds(
        req.body.related_project_ids,
      );
      delete req.body.related_project_ids;

      const removedMediaRows = await syncProjectMedia(req, item, t);

      const nextSlug = req.body.slug;
      if (!nextSlug || !String(nextSlug).trim()) {
        req.body.slug = await generateUniqueSlug(
          dataModel,
          req.body.title || item.title,
          { excludeId: id, transaction: t },
        );
      } else {
        req.body.slug = generateSlug(nextSlug);
        if (item.slug !== req.body.slug) {
          await assertNoDuplicate(dataModel, {
            field: "slug",
            value: req.body.slug,
            excludeId: id,
            transaction: t,
          });
        }
      }

      await item.update(req.body, { transaction: t });

      if (relatedProjectIds !== null) {
        await item.setRelatedProjects(relatedProjectIds, { transaction: t });
      }

      await t.commit();

      // Clean up gallery files dropped from the project (best-effort, after commit).
      await deleteProjectMediaFiles(removedMediaRows);

      const updated = await dataModel.findByPk(id, {
        include: relatedInclude,
      });
      sendSuccessResponse(res, updated, "Project updated successfully");
    } catch (error) {
      await t.rollback();
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
        include: [{ model: models.ProjectMedia, as: "project_media" }],
        transaction: t,
      });
      if (!item) {
        await t.rollback();
        return sendNotFoundError(res, "Project");
      }

      const mediaRows = item.project_media || [];
      for (const row of mediaRows) {
        await row.destroy({ transaction: t });
      }

      await item.destroy({ transaction: t });

      await t.commit();

      await Promise.all(
        [item.thumbnail, item.media_path].filter(Boolean).map((p) => deleteOldFile(p)),
      );
      await deleteProjectMediaFiles(mediaRows);

      sendSuccessResponse(res, { id: id }, "Project deleted successfully");
    } catch (error) {
      await t.rollback();
      return sendErrorResponse(res, error);
    }
  }
}

module.exports = ProjectsController;
