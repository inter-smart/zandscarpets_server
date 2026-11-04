const { QueryTypes } = require("sequelize");
const { models, sequelize } = require("../../../../../database/models");
const Mailer = require("../../../../../services/mailerServices");
const Logger = require("../../../../../config/logger");
const { verifyRecaptchaToken } = require("../../../../../services/recaptchaService");
const { assignQuoteReferenceCode } = require("../../../../../utils/quoteCodeHelper");
const { BASE_URL } = require("../../../../../constants");

const text = (value) => value ?? "";

// DB media columns store a relative path; every other media field in this
// backend is prefixed with BASE_URL before leaving the API (see
// http/traits/mediaButtonHelper.js) - do the same here so stored/re-served
// quote item images aren't broken relative paths.
const absoluteMediaUrl = (path) => (path ? `${BASE_URL}/${path}` : null);

class QuoteRequestService {
  // Dropdown data for the /quotes/form fallback picker (used when the cart is empty,
  // i.e. the user navigated to the form directly) — same shape as sample-request/options.
  static async options() {
    const [categories, products] = await Promise.all([
      sequelize.query(
        `SELECT id, slug, title, title_ar FROM product_categories
         WHERE is_active = true AND deleted_at IS NULL AND slug IS NOT NULL
         ORDER BY sort_order ASC, id ASC`,
        { type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT p.id, p.slug, p.title, p.title_ar, p.price, p.list_media_path, c.slug AS category_slug
         FROM products p
         JOIN product_categories c ON c.id = p.product_category_id AND c.is_active = true AND c.deleted_at IS NULL
         WHERE p.is_active = true AND p.deleted_at IS NULL
         ORDER BY p.title ASC`,
        { type: QueryTypes.SELECT },
      ),
    ]);

    return {
      categories: categories.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: text(row.title),
        title_ar: text(row.title_ar),
      })),
      products: products.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: text(row.title),
        title_ar: text(row.title_ar),
        price: row.price,
        media: absoluteMediaUrl(row.list_media_path),
        category_slug: row.category_slug,
      })),
    };
  }

  // Looks up the referenced products/variants (when ids are given) so the
  // stored snapshot - title, slug, media, price - reflects the real catalog
  // at submission time rather than whatever the client happened to send.
  static async _resolveItems(items) {
    const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
    const variantIds = [...new Set(items.map((i) => i.variant_id).filter(Boolean))];

    const [products, variants] = await Promise.all([
      productIds.length
        ? models.Products.findAll({ where: { id: productIds } })
        : [],
      variantIds.length
        ? models.ProductVariants.findAll({ where: { id: variantIds } })
        : [],
    ]);

    const productsById = new Map(products.map((p) => [p.id, p]));
    const variantsById = new Map(variants.map((v) => [v.id, v]));

    return items.map((item) => {
      const product = item.product_id ? productsById.get(item.product_id) : null;
      const variant = item.variant_id ? variantsById.get(item.variant_id) : null;

      return {
        product_id: product ? product.id : null,
        product_title: product ? product.title : item.product_title,
        product_title_ar: product ? product.title_ar : item.product_title_ar || null,
        product_slug: product ? product.slug : item.product_slug || null,
        variant_id: variant ? variant.id : null,
        variant_label: variant ? variant.label : item.variant_label || null,
        variant_label_ar: variant ? variant.label_ar : item.variant_label_ar || null,
        variant_sku: variant ? variant.sku : item.variant_sku || null,
        // Variant image first; variants often have none, so fall back to the
        // product's list image, then whatever the client sent.
        media_path:
          absoluteMediaUrl(variant?.media_path) ||
          absoluteMediaUrl(product?.list_media_path) ||
          item.media_path ||
          null,
        quantity: item.quantity,
        unit_price_snapshot: product ? product.price : null,
      };
    });
  }

  static async create(payload, lang = "en") {
    const { score } = await verifyRecaptchaToken(payload.recaptcha_token, {
      action: "quote_request",
    });

    const resolvedItems = await this._resolveItems(payload.items);

    const quoteRequest = await sequelize.transaction(async (transaction) => {
      const created = await models.QuoteRequest.create(
        {
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          company_name: payload.company_name || null,
          message: payload.message || null,
          recaptcha_score: score,
        },
        { transaction },
      );

      await models.QuoteRequestItem.bulkCreate(
        resolvedItems.map((item) => ({ ...item, quote_request_id: created.id })),
        { transaction },
      );

      await assignQuoteReferenceCode(created, { transaction });

      return created.reload({
        include: [{ model: models.QuoteRequestItem, as: "items" }],
        transaction,
      });
    });

    // Independently try/caught, and not awaited before returning - an SMTP
    // outage must never fail the already-saved request.
    Mailer.sendQuoteRequestAdminNotification(quoteRequest).catch((error) =>
      Logger.error("Quote request admin notification failed", {
        message: error.message,
        quoteRequestId: quoteRequest.id,
      }),
    );
    Mailer.sendQuoteRequestConfirmation(quoteRequest).catch((error) =>
      Logger.error("Quote request confirmation email failed", {
        message: error.message,
        quoteRequestId: quoteRequest.id,
      }),
    );

    return quoteRequest;
  }
}

module.exports = QuoteRequestService;
