// Transactional writers, one per entity. Only called from a `commit`
// controller action, after the advisory lock is taken and uniqueness has
// been re-checked against current DB state (validate ran against a
// possibly-stale snapshot). Rows are written in file order, which the
// Categories validator already guarantees is parent-before-child for
// same-file parent references.

const { lookupKey } = require("./validators/shared");
const { generateUniqueSlug } = require("../../../utils/slugHelper");
const { buildSkuBase, generateUniqueSku } = require("../../../utils/skuHelper");
const { buildCombinationKey, buildLabel, cartesian } = require("./resolvers");

async function importCategories(normalizedRows, { models, transaction }) {
  // in-file title -> the real id this row ended up with (whether created
  // or updated), so a later row's parent_title resolves correctly either
  // way. `row.resolved_parent_id` from the validator is only trustworthy
  // for a "db"-sourced parent (nothing was written between validate and
  // here in the same transaction); a "file"-sourced parent may have been
  // only a pending create at validate time, so it's always re-resolved
  // from this map instead.
  const resolvedByTitleKey = new Map();
  let created = 0;
  let updated = 0;

  for (const row of normalizedRows) {
    let parentId = null;
    if (row.parent_title_input) {
      parentId = row.parent_title_source === "file" ? resolvedByTitleKey.get(row.parent_title_key) ?? null : row.resolved_parent_id;
    }

    const fields = {
      title: row.title,
      title_ar: row.title_ar,
      parent_id: parentId,
      description: row.description,
      description_ar: row.description_ar,
      material_type: row.material_type,
      material_type_ar: row.material_type_ar,
      sort_order: row.sort_order,
      is_active: row.is_active,
      show_in_navbar: row.show_in_navbar,
    };

    let id;
    if (row.mode === "update") {
      // Slug is regenerated from the (possibly unchanged) title every
      // time, same as the manual controller does for a blank slug —
      // `excludeId` means an unchanged title keeps its current slug.
      fields.slug = await generateUniqueSlug(models.ProductCategories, row.title, { excludeId: row.existingId, transaction });
      const item = await models.ProductCategories.findByPk(row.existingId, { transaction });
      await item.update(fields, { transaction });
      id = row.existingId;
      updated += 1;
    } else {
      fields.slug = await generateUniqueSlug(models.ProductCategories, row.title, { transaction });
      const createdRow = await models.ProductCategories.create(fields, { transaction });
      id = createdRow.id;
      created += 1;
    }

    resolvedByTitleKey.set(lookupKey(row.title), id);
  }

  return { created, updated, skipped: 0 };
}

async function importAttributes(normalizedRows, { models, transaction }) {
  let created = 0;
  let updated = 0;

  for (const row of normalizedRows) {
    const fields = {
      title: row.title,
      title_ar: row.title_ar,
      type: row.type,
      sort_order: row.sort_order,
      is_active: row.is_active,
    };

    // Same "common logic" as attributeController.js's normalizeSlug() for a
    // blank slug — bulk upload never accepts a user-typed slug here.
    if (row.mode === "update") {
      fields.slug = await generateUniqueSlug(models.Attributes, row.title, { excludeId: row.existingId, transaction });
      const item = await models.Attributes.findByPk(row.existingId, { transaction });
      await item.update(fields, { transaction });
      updated += 1;
    } else {
      fields.slug = await generateUniqueSlug(models.Attributes, row.title, { transaction });
      await models.Attributes.create(fields, { transaction });
      created += 1;
    }
  }

  return { created, updated, skipped: 0 };
}

async function importAttributeValues(normalizedRows, { models, transaction }) {
  let created = 0;
  let updated = 0;

  for (const row of normalizedRows) {
    const fields = {
      attribute_id: row.attribute_id,
      value: row.value,
      value_ar: row.value_ar,
      media_path: row.media_path,
      media_alt: row.media_alt,
      media_alt_ar: row.media_alt_ar,
      color_code: row.color_code,
      sort_order: row.sort_order,
      is_active: row.is_active,
    };

    // Same "common logic" as attributeValueController.js's normalizeSlug()
    // for a blank slug — scoped per attribute, exactly like the manual flow.
    const slugSource = row.value || row.media_alt || `value-${row.rowNumber}`;

    if (row.mode === "update") {
      fields.slug = await generateUniqueSlug(models.AttributeValues, slugSource, {
        excludeId: row.existingId,
        scope: { attribute_id: row.attribute_id },
        transaction,
      });
      const item = await models.AttributeValues.findByPk(row.existingId, { transaction });
      await item.update(fields, { transaction });
      updated += 1;
    } else {
      fields.slug = await generateUniqueSlug(models.AttributeValues, slugSource, {
        scope: { attribute_id: row.attribute_id },
        transaction,
      });
      await models.AttributeValues.create(fields, { transaction });
      created += 1;
    }
  }

  return { created, updated, skipped: 0 };
}

async function importProducts(normalizedRows, { models, transaction }) {
  let created = 0;
  let updated = 0;

  for (const row of normalizedRows) {
    const fields = {
      title: row.title,
      title_ar: row.title_ar,
      product_category_id: row.product_category_id,
      short_description: row.short_description,
      short_description_ar: row.short_description_ar,
      product_description: row.product_description,
      product_description_ar: row.product_description_ar,
      main_media_path: row.main_media_path,
      list_media_path: row.list_media_path,
      sort_order: row.sort_order,
      is_active: row.is_active,
    };

    if (row.mode === "update") {
      // Attribute links are never touched on update — mirrors the manual
      // controller's syncLinks(), which only touches product_attributes
      // when the field is explicitly processed (see productsValidator.js).
      // Slug is still regenerated for consistency with Categories/
      // Attributes/Attribute Values, even though title (part of the match
      // key) can't have changed for a matched row, so this is a no-op in
      // practice — `excludeId` means it resolves back to the same slug.
      fields.slug = await generateUniqueSlug(models.Products, row.title, { excludeId: row.existingId, transaction });
      const item = await models.Products.findByPk(row.existingId, { transaction });
      await item.update(fields, { transaction });
      updated += 1;
    } else {
      fields.slug = await generateUniqueSlug(models.Products, row.title, { transaction });
      const createdRow = await models.Products.create(fields, { transaction });

      if (row.attribute_ids.length) {
        await models.ProductAttributes.bulkCreate(
          row.attribute_ids.map((attributeId, index) => ({
            product_id: createdRow.id,
            attribute_id: attributeId,
            sort_order: index,
          })),
          { transaction },
        );
      }
      created += 1;
    }
  }

  return { created, updated, skipped: 0 };
}

async function importProductVariants(normalizedRows, { models, transaction }) {
  for (const row of normalizedRows) {
    const sku = row.sku
      ? row.sku
      : await generateUniqueSku(
          models.ProductVariants,
          buildSkuBase({ slug: row.product_slug }, row.attribute_value_slugs.map((slug) => ({ slug }))),
          { transaction },
        );
    const created = await models.ProductVariants.create(
      {
        product_id: row.product_id,
        label: row.label,
        label_ar: row.label_ar,
        sku,
        media_path: row.media_path,
        combination_key: row.combination_key,
        sort_order: row.sort_order,
        is_active: row.is_active,
      },
      { transaction },
    );

    await models.VariantAttributeValues.bulkCreate(
      row.attribute_value_pairs.map((pair) => ({
        variant_id: created.id,
        attribute_id: pair.attribute_id,
        attribute_value_id: pair.attribute_value_id,
      })),
      { transaction },
    );
  }
  return { created: normalizedRows.length, skipped: 0 };
}

// Product Main Upload — one row cascades Category path -> Attribute(s) ->
// Attribute Value(s) -> Product -> its SEO meta data. Re-derives
// create-vs-reuse for real from the raw fields productMainValidator.js
// normalized (category_segments, attribute_value_pairs), with its own
// fresh DB-backed + this-import-so-far caches — the same relationship
// every other upsert importer has with its validator. Meta data is a
// simple 1:1-by-product_id upsert (the model's own unique index on
// product_id), checked after the product's real id is known.
async function importProductMain(normalizedRows, { models, transaction }) {
  let created = 0;
  let updated = 0;
  let categoriesCreated = 0;
  let attributesCreated = 0;
  let attributeValuesCreated = 0;
  let variantsCreated = 0;
  let labelsCreated = 0;

  const categoryByKey = new Map(); // `${parent_id|"null"}:${titleKey}` -> id
  const attributeByTitleKey = new Map(); // titleKey -> { id, type }
  const valueByKey = new Map(); // `${attributeTitleKey}:${valueKey}` -> id
  const valueDetailsById = new Map(); // id -> { value, value_ar }, for building variant labels
  const labelByKey = new Map(); // `${type}:${titleKey}` -> id

  const resolveCategoryChain = async (segments) => {
    let parentId = null;
    for (const segment of segments) {
      const key = `${parentId ?? "null"}:${lookupKey(segment)}`;
      if (categoryByKey.has(key)) {
        parentId = categoryByKey.get(key);
        continue;
      }
      const existing = await models.ProductCategories.findOne({
        where: { parent_id: parentId, title: segment },
        transaction,
      });
      if (existing) {
        categoryByKey.set(key, existing.id);
        parentId = existing.id;
        continue;
      }
      const slug = await generateUniqueSlug(models.ProductCategories, segment, { transaction });
      const createdCategory = await models.ProductCategories.create(
        { title: segment, title_ar: segment, slug, parent_id: parentId },
        { transaction },
      );
      categoryByKey.set(key, createdCategory.id);
      parentId = createdCategory.id;
      categoriesCreated += 1;
    }
    return parentId;
  };

  // A brand-new attribute's type is decided by whether THIS pair carries a
  // color code — same rule the validator uses, applied independently here
  // in the same row order, so both naturally agree.
  const resolveAttributeId = async (attributeTitle, colorCode) => {
    const attrKey = lookupKey(attributeTitle);
    if (attributeByTitleKey.has(attrKey)) return attributeByTitleKey.get(attrKey);

    const existing = await models.Attributes.findOne({ where: { title: attributeTitle }, transaction });
    if (existing) {
      attributeByTitleKey.set(attrKey, { id: existing.id, type: existing.type });
      return attributeByTitleKey.get(attrKey);
    }

    const type = colorCode ? "color" : "text";
    const slug = await generateUniqueSlug(models.Attributes, attributeTitle, { transaction });
    const createdAttribute = await models.Attributes.create({ title: attributeTitle, title_ar: attributeTitle, slug, type }, { transaction });
    attributesCreated += 1;
    const entry = { id: createdAttribute.id, type };
    attributeByTitleKey.set(attrKey, entry);
    return entry;
  };

  const resolveAttributeValueId = async (attribute, attributeTitle, valueText, colorCode) => {
    const attrKey = lookupKey(attributeTitle);
    const valueKey = `${attrKey}:${lookupKey(valueText)}`;
    if (valueByKey.has(valueKey)) return valueByKey.get(valueKey);

    const existing = await models.AttributeValues.findOne({
      where: { attribute_id: attribute.id, value: valueText },
      transaction,
    });
    if (existing) {
      valueByKey.set(valueKey, existing.id);
      valueDetailsById.set(existing.id, { value: existing.value, value_ar: existing.value_ar, slug: existing.slug });
      return existing.id;
    }

    const fields = { attribute_id: attribute.id, value: valueText, value_ar: valueText };
    if (attribute.type === "color" && colorCode) fields.color_code = colorCode;
    const slug = await generateUniqueSlug(models.AttributeValues, valueText, { scope: { attribute_id: attribute.id }, transaction });
    const createdValue = await models.AttributeValues.create({ ...fields, slug }, { transaction });
    attributeValuesCreated += 1;
    valueByKey.set(valueKey, createdValue.id);
    valueDetailsById.set(createdValue.id, { value: createdValue.value, value_ar: createdValue.value_ar, slug: createdValue.slug });
    return createdValue.id;
  };

  // Scoped per `type` so "New" can exist independently as both a tag and a
  // specification — mirrors productLabelsController.js's own `type`-scoped
  // slug/duplicate checks.
  const resolveLabelId = async (type, title) => {
    const labelKey = `${type}:${lookupKey(title)}`;
    if (labelByKey.has(labelKey)) return labelByKey.get(labelKey);

    const existing = await models.ProductLabels.findOne({ where: { type, title }, transaction });
    if (existing) {
      labelByKey.set(labelKey, existing.id);
      return existing.id;
    }

    const slug = await generateUniqueSlug(models.ProductLabels, title, { scope: { type }, transaction });
    const createdLabel = await models.ProductLabels.create({ type, title, title_ar: title, slug }, { transaction });
    labelsCreated += 1;
    labelByKey.set(labelKey, createdLabel.id);
    return createdLabel.id;
  };

  for (const row of normalizedRows) {
    const categoryId = await resolveCategoryChain(row.category_segments);

    const attributeIds = [];
    const orderedValueIdLists = []; // one value-id array per attribute, same order as attributeIds
    for (const group of row.attribute_value_groups) {
      const firstHexItem = group.items.find((item) => item.colorCode);
      const attribute = await resolveAttributeId(group.attributeTitle, firstHexItem?.colorCode);
      const valueIds = [];
      for (const item of group.items) {
        // Icon values created here carry just `value` (the ref text, as a
        // name/label) — media_path/media_alt are left blank, filled in
        // later via the Attribute Values edit screen.
        const valueId = await resolveAttributeValueId(attribute, group.attributeTitle, item.valueText, item.colorCode);
        valueIds.push(valueId);
      }
      if (!attributeIds.includes(attribute.id)) {
        attributeIds.push(attribute.id);
        orderedValueIdLists.push(valueIds);
      }
    }

    const fields = {
      title: row.title,
      title_ar: row.title_ar,
      product_category_id: categoryId,
      short_description: row.short_description,
      short_description_ar: row.short_description_ar,
      product_description: row.product_description,
      product_description_ar: row.product_description_ar,
    };

    let productId;
    if (row.mode === "update") {
      // No image/sort_order/is_active columns on this sheet (v7) — an
      // update row never touches an existing product's image, sort order,
      // or active status, only the fields this sheet actually carries.
      fields.slug = await generateUniqueSlug(models.Products, row.title, { excludeId: row.existingId, transaction });
      const item = await models.Products.findByPk(row.existingId, { transaction });
      await item.update(fields, { transaction });
      productId = row.existingId;
      updated += 1;
    } else {
      // A brand-new product has no existing image/sort_order/is_active to
      // preserve — these are this sheet's hardcoded defaults (see
      // productMainValidator.js); set here only on create.
      fields.main_media_path = row.main_media_path;
      fields.list_media_path = row.list_media_path;
      fields.sort_order = row.sort_order;
      fields.is_active = row.is_active;
      fields.slug = await generateUniqueSlug(models.Products, row.title, { transaction });
      const createdProduct = await models.Products.create(fields, { transaction });
      productId = createdProduct.id;

      if (attributeIds.length) {
        await models.ProductAttributes.bulkCreate(
          attributeIds.map((attributeId, index) => ({ product_id: productId, attribute_id: attributeId, sort_order: index })),
          { transaction },
        );
      }

      // Tags/Specifications — no explicit join model for product_label_map
      // (it's a plain `through: "..."` string on the association), so this
      // is the one relation here attached via the Sequelize mixin instead
      // of a bulkCreate, mirroring the real manual controller's own
      // `item.setLabels(...)` (productsController.js).
      if (row.label_refs.length) {
        const labelIds = [];
        for (const { title, type } of row.label_refs) {
          labelIds.push(await resolveLabelId(type, title));
        }
        await createdProduct.addLabels(labelIds, { transaction });
      }

      // Generate every combination of the resolved values as a real
      // variant, same shape as importProductVariants() just above and the
      // manual "generate all combinations" action in variantsController.js
      // (brand-new product, so there's never a pre-existing combination to
      // collide with — no dedupe-against-DB needed here).
      if (row.generate_variants && orderedValueIdLists.length) {
        const combinations = cartesian(orderedValueIdLists);
        for (const [index, combo] of combinations.entries()) {
          const comboValues = combo.map((id) => valueDetailsById.get(id));
          const sku = await generateUniqueSku(
            models.ProductVariants,
            buildSkuBase({ slug: fields.slug }, comboValues),
            { transaction },
          );
          const createdVariant = await models.ProductVariants.create(
            {
              product_id: productId,
              label: buildLabel(comboValues, "value"),
              label_ar: buildLabel(comboValues, "value_ar"),
              sku,
              combination_key: buildCombinationKey(combo),
              sort_order: index,
              is_active: true,
            },
            { transaction },
          );
          await models.VariantAttributeValues.bulkCreate(
            attributeIds.map((attributeId, attrIndex) => ({
              variant_id: createdVariant.id,
              attribute_id: attributeId,
              attribute_value_id: combo[attrIndex],
            })),
            { transaction },
          );
          variantsCreated += 1;
        }
      }
      created += 1;
    }

    const metaFields = {
      type: "product",
      product_id: productId,
      meta_title: row.meta_title,
      meta_title_ar: row.meta_title_ar,
      meta_description: row.meta_description,
      meta_description_ar: row.meta_description_ar,
      meta_keywords: row.meta_keywords,
      meta_keywords_ar: row.meta_keywords_ar,
    };
    const existingMeta = await models.MetaData.findOne({ where: { product_id: productId }, transaction });
    if (existingMeta) {
      await existingMeta.update(metaFields, { transaction });
    } else {
      await models.MetaData.create(metaFields, { transaction });
    }
  }

  return { created, updated, skipped: 0, categoriesCreated, attributesCreated, attributeValuesCreated, variantsCreated, labelsCreated };
}

async function importBlogs(normalizedRows, { models, transaction }) {
  let created = 0;
  let updated = 0;

  for (const row of normalizedRows) {
    const fields = {
      title: row.title,
      title_ar: row.title_ar,
      excerpt: row.excerpt,
      excerpt_ar: row.excerpt_ar,
      content: row.content,
      content_ar: row.content_ar,
      media_alt: row.media_alt ?? null,
      media_alt_ar: row.media_alt_ar ?? null,
      published_at: row.published_at,
      is_active: row.is_active,
    };

    let slug = row.slug;
    if (row.mode === "update") {
      const item = await models.Blogs.findByPk(row.existingId, { transaction });
      // A missing image file never wipes the image a post already has.
      if (row.media_path) fields.media_path = row.media_path;
      if (row.image_missing && !row.existingHasImage) fields.is_active = false;
      await item.update(fields, { transaction });
      updated += 1;
    } else {
      slug = await generateUniqueSlug(models.Blogs, row.slug, { transaction });
      fields.slug = slug;
      fields.media_path = row.media_path ?? null;
      // No hero image yet: keep it off the storefront until one is added.
      if (row.image_missing) fields.is_active = false;
      await models.Blogs.create(fields, { transaction });
      created += 1;
    }

    // SEO lives in MetaData keyed by the blog slug (not a FK).
    const metaFields = {
      type: "blog",
      blog_id: slug,
      meta_title: row.meta_title,
      meta_title_ar: row.meta_title,
      meta_description: row.meta_description,
      meta_description_ar: row.meta_description,
      meta_keywords: row.meta_keywords,
      meta_keywords_ar: row.meta_keywords,
    };
    const existingMeta = await models.MetaData.findOne({ where: { type: "blog", blog_id: slug }, transaction });
    if (existingMeta) {
      await existingMeta.update(metaFields, { transaction });
    } else {
      await models.MetaData.create(metaFields, { transaction });
    }
  }

  return { created, updated, skipped: 0 };
}

module.exports = {
  importBlogs,
  importCategories,
  importAttributes,
  importAttributeValues,
  importProducts,
  importProductVariants,
  importProductMain,
};
