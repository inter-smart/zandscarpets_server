const { QueryTypes } = require("sequelize");
const { models, sequelize } = require("../../../../../database/models");
const { withVisibility } = require("../../traits/sectionHelpers");
const { singleMediaWithoutType } = require("../../traits/mediaButtonHelper");
const MetaTagService = require("../metaTag/MetaTagService");

const text = (value) => value ?? "";
const { BASE_URL } = require("../../../../../constants");
const absoluteUrl = (relativePath) => (relativePath ? `${BASE_URL}/${relativePath}` : null);

const DEFAULT_LIMIT = 12;
// the storefront can ask for the first N pages at once (a `?page=N` link)
const MAX_LIMIT = 120;

const toPositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

// Same convention as the home / about APIs: both languages per field. The downloads list is
// paginated (`?page=1&limit=12`) for the storefront's Load More.
class DownloadsService {
  static async page(req) {
    const page = toPositiveInt(req?.query?.page, 1);
    const limit = Math.min(toPositiveInt(req?.query?.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const offset = (page - 1) * limit;

    const [banner = [], otherMeta, rows, countRows] = await Promise.all([
      models.Banners.findAll({
        include: [
          {
            model: models.Page,
            as: "page",
            required: true,
            attributes: [],
            where: { is_active: true, page_slug: "downloads" },
          },
        ],
      }),
      MetaTagService.getOtherMetaForPage("downloads"),
      sequelize.query(
        `SELECT id, title, title_ar, description, description_ar, file_path,
                file_original_filename, file_size_bytes
         FROM downloads
         WHERE is_active = true AND deleted_at IS NULL
         ORDER BY sort_order ASC, id ASC
         LIMIT :limit OFFSET :offset`,
        { replacements: { limit, offset }, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT COUNT(*)::int AS count FROM downloads WHERE is_active = true AND deleted_at IS NULL`,
        { type: QueryTypes.SELECT },
      ),
    ]);

    const count = countRows[0]?.count ?? 0;
    const totalPages = Math.max(Math.ceil(count / limit), 1);

    const bannerSection = {
      title: text(banner[0]?.title),
      title_ar: text(banner[0]?.title_ar),
      sub_title: text(banner[0]?.sub_title),
      sub_title_ar: text(banner[0]?.sub_title_ar),
      media: singleMediaWithoutType(banner[0] ?? {}, "media_path", "media_alt", "media_alt_ar"),
    };

    return {
      data: {
        other_meta: otherMeta.other_meta,
        other_meta_ar: otherMeta.other_meta_ar,
        banner_section: withVisibility(bannerSection),
        downloads: rows.map((row) => ({
          id: row.id,
          title: text(row.title),
          title_ar: text(row.title_ar),
          description: text(row.description),
          description_ar: text(row.description_ar),
          file: {
            url: absoluteUrl(row.file_path),
            filename: text(row.file_original_filename),
            size_bytes: row.file_size_bytes ?? null,
          },
        })),
        pagination: { page, limit, totalCount: count, totalPages, hasMore: page < totalPages },
      },
    };
  }
}

module.exports = DownloadsService;
