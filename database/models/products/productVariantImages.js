const { DataTypes } = require("sequelize");

// Gallery images of a variant. A variant with no images of its own shows the product's.
module.exports = (sequelize) => {
  const ProductVariantImages = sequelize.define(
    "ProductVariantImages",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      variant_id: { type: DataTypes.INTEGER, allowNull: false },
      media_path: { type: DataTypes.TEXT, allowNull: false },
      media_alt: { type: DataTypes.STRING, allowNull: true },
      media_alt_ar: { type: DataTypes.STRING, allowNull: true },
      sort_order: { type: DataTypes.SMALLINT, defaultValue: 0 },
      deleted_at: { type: DataTypes.DATE },
    },
    {
      tableName: "product_variant_images",
      timestamps: true,
      paranoid: true,
      deletedAt: "deleted_at",
      indexes: [{ name: "product_variant_images_variant_sort", fields: ["variant_id", "sort_order"] }],
    },
  );

  ProductVariantImages.associate = function (models) {
    ProductVariantImages.belongsTo(models.ProductVariants, { foreignKey: "variant_id", as: "variant" });
  };

  return ProductVariantImages;
};
