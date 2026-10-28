const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProductVariants = sequelize.define(
    "ProductVariants",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      // Human-readable combination, e.g. "120cm / Oak". Generated from the
      // selected attribute values (product attribute order).
      label: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      label_ar: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "",
      },
      // Optional reference code the client may use.
      sku: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      media_path: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      media_alt: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      media_alt_ar: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      // Deterministic key for the combination: the selected attribute value
      // ids, sorted ascending and joined with "-" (e.g. "3-7"). Unique per
      // product so the same combination cannot be created twice.
      combination_key: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      sort_order: {
        type: DataTypes.SMALLINT,
        defaultValue: 0,
      },
      deleted_at: {
        type: DataTypes.DATE,
      },
    },
    {
      tableName: "product_variants",
      timestamps: true,
      paranoid: true,
      deletedAt: "deleted_at",
      indexes: [
        { name: "product_variants_product_id", fields: ["product_id"] },
        {
          name: "product_variants_product_combination_unique",
          unique: true,
          fields: ["product_id", "combination_key"],
          where: { deleted_at: null },
        },
        {
          // Nulls are distinct in a Postgres unique index, so variants without
          // a sku are allowed; only duplicate non-null skus conflict.
          name: "product_variants_sku_unique",
          unique: true,
          fields: [sequelize.fn("lower", sequelize.col("sku"))],
          where: { deleted_at: null },
        },
      ],
    },
  );

  ProductVariants.associate = function (models) {
    ProductVariants.belongsTo(models.Products, {
      foreignKey: "product_id",
      as: "product",
    });

    ProductVariants.hasMany(models.VariantAttributeValues, {
      foreignKey: "variant_id",
      as: "valueLinks",
    });

    // This variant's own dynamic detail overrides/hides (see
    // detailsResolverService.js for how these combine with the product's).
    ProductVariants.hasMany(models.DetailMappings, {
      foreignKey: "variant_id",
      as: "detailMappings",
    });
    ProductVariants.hasMany(models.DetailItemExclusions, {
      foreignKey: "variant_id",
      as: "detailItemExclusions",
    });

    // This variant's own gallery; empty = the product's gallery is shown.
    ProductVariants.hasMany(models.ProductVariantImages, {
      foreignKey: "variant_id",
      as: "images",
    });

    // One SEO meta per variant (see MetaData metaData.js — discriminated by type).
    ProductVariants.hasOne(models.MetaData, {
      foreignKey: "variant_id",
      as: "metaData",
    });
  };

  return ProductVariants;
};
