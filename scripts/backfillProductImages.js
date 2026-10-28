// One-time backfill for the product image gallery: the detail carousel now starts with the product's
// list image, so the old detail ("main") image must not be lost.
//   - list image empty             -> the main image becomes the list image
//   - both set and they differ     -> the main image is added as the first gallery image
// Run `npm run sync` first (creates product_images), then `node scripts/backfillProductImages.js`.
// Safe to re-run: a product that already has the main image in its gallery is skipped.
const { sequelize, models } = require("../database/models");

const run = async () => {
  await sequelize.authenticate();
  const t = await sequelize.transaction();
  try {
    const products = await models.Products.findAll({ transaction: t });
    let promoted = 0;
    let added = 0;

    for (const product of products) {
      const main = product.main_media_path;
      if (!main) continue;

      if (!product.list_media_path) {
        await product.update(
          { list_media_path: main, list_media_alt: product.media_alt, list_media_alt_ar: product.media_alt_ar },
          { transaction: t },
        );
        promoted += 1;
        continue;
      }

      if (product.list_media_path === main) continue;

      const exists = await models.ProductImages.findOne({
        where: { product_id: product.id, media_path: main },
        transaction: t,
      });
      if (exists) continue;

      // sort_order -1 keeps it ahead of any gallery image added since
      await models.ProductImages.create(
        { product_id: product.id, media_path: main, media_alt: product.media_alt, media_alt_ar: product.media_alt_ar, sort_order: -1 },
        { transaction: t },
      );
      added += 1;
    }

    await t.commit();
    console.log(`Done: ${promoted} main image(s) became the list image, ${added} added to galleries.`);
    process.exit(0);
  } catch (error) {
    await t.rollback();
    console.error("Backfill failed:", error);
    process.exit(1);
  }
};

run();
