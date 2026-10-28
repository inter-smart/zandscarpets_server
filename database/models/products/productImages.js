const { DataTypes } = require("sequelize");

// Gallery images of a product (shown after its list image in the detail carousel): one row per image
module.exports = (sequelize) => {
  const ProductImages = sequelize.define(
    "ProductImages",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      product_id: { type: DataTypes.INTEGER, allowNull: false },
      media_path: { type: DataTypes.TEXT, allowNull: false },
      media_alt: { type: DataTypes.STRING, allowNull: true },
      media_alt_ar: { type: DataTypes.STRING, allowNull: true },
      sort_order: { type: DataTypes.SMALLINT, defaultValue: 0 },
      deleted_at: { type: DataTypes.DATE },
    },
    {
      tableName: "product_images",
      timestamps: true,
      paranoid: true,
      deletedAt: "deleted_at",
      indexes: [{ name: "product_images_product_sort", fields: ["product_id", "sort_order"] }],
    },
  );

  ProductImages.associate = function (models) {
    ProductImages.belongsTo(models.Products, { foreignKey: "product_id", as: "product" });
  };

  return ProductImages;
};
