const { DataTypes } = require("sequelize");

// "This product or this variant uses this field." Exactly one of
// product_id/variant_id must be set, and `hidden` only ever applies to a
// variant-level mapping (a hidden mapping marks "suppress this inherited
// field for this variant" and must have zero items).
//
// Postgres can express "exactly one of two columns is set" as a CHECK
// constraint, but this codebase has no migration system — schema changes
// go through model definitions + `sequelize.sync({ alter: true })`, which
// cannot emit an arbitrary CHECK constraint declaratively. The `validate`
// block below runs on every `.save()`/`.create()` through Sequelize's own
// instance validation, but that can be bypassed by bulk operations or raw
// queries, so the authoritative check is re-done inside every controller
// transaction that writes this table (see mappingsController.js). If this
// invariant is ever violated outside that code path, the resolver
// (detailsResolverService.js) defensively skips the inconsistent row and
// logs a warning rather than crashing.
module.exports = (sequelize) => {
  const DetailMappings = sequelize.define(
    "DetailMappings",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      variant_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      field_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      hidden: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      sort_order: {
        type: DataTypes.SMALLINT,
        defaultValue: 0,
      },
    },
    {
      tableName: "detail_mappings",
      timestamps: true,
      validate: {
        exactlyOneOwner() {
          const hasProduct = this.product_id !== null && this.product_id !== undefined;
          const hasVariant = this.variant_id !== null && this.variant_id !== undefined;
          if (hasProduct === hasVariant) {
            throw new Error(
              "A detail mapping must have exactly one of product_id or variant_id set",
            );
          }
          if (this.hidden && !hasVariant) {
            throw new Error("Only a variant-level mapping can be hidden");
          }
        },
      },
      indexes: [
        {
          name: "detail_mappings_product_field_unique",
          unique: true,
          fields: ["product_id", "field_id"],
          where: sequelize.literal('"product_id" IS NOT NULL'),
        },
        {
          name: "detail_mappings_variant_field_unique",
          unique: true,
          fields: ["variant_id", "field_id"],
          where: sequelize.literal('"variant_id" IS NOT NULL'),
        },
        { name: "detail_mappings_product_id", fields: ["product_id"] },
        { name: "detail_mappings_variant_id", fields: ["variant_id"] },
        { name: "detail_mappings_field_id", fields: ["field_id"] },
      ],
    },
  );

  DetailMappings.associate = function (models) {
    // Products/ProductVariants are `paranoid: true`, so Sequelize silently
    // forces this FK's onDelete to SET NULL regardless of what's passed
    // here (it refuses to CASCADE off a soft-deletable parent, since a
    // normal `.destroy()` on that parent never actually removes the row).
    // That SET NULL is just a backstop for a direct SQL hard-delete; the
    // real cascade behavior the spec asks for ("deleting a product/variant
    // deletes its mappings") is implemented explicitly in
    // productsController.js / variantsController.js `destroy`, which
    // hard-deletes this table's rows for the product/variant being
    // (soft-)deleted before committing — mirroring how those controllers
    // already hard-delete VariantAttributeValues/Faqs.
    DetailMappings.belongsTo(models.Products, {
      foreignKey: "product_id",
      as: "product",
    });
    DetailMappings.belongsTo(models.ProductVariants, {
      foreignKey: "variant_id",
      as: "variant",
    });
    DetailMappings.belongsTo(models.DetailFields, {
      foreignKey: "field_id",
      as: "field",
    });
    // Real DB-level cascade (available even without a migration system,
    // since it's expressed on the FK itself): deleting a mapping deletes
    // its items.
    DetailMappings.hasMany(models.DetailItems, {
      foreignKey: { name: "mapping_id", allowNull: false, onDelete: "CASCADE" },
      as: "items",
    });
  };

  return DetailMappings;
};
