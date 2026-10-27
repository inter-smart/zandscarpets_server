const { DataTypes } = require("sequelize");

// Inner-page banner shown at the top of one product's detail page. One banner
// per product; products without one fall back to the storefront's static banner.
// Not paranoid: a soft-deleted row would keep blocking the unique `product_id`.
module.exports = (sequelize) => {
  const ProductBanners = sequelize.define(
    "ProductBanners",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: "products", key: "id" },
        onDelete: "CASCADE",
      },
      media_path: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      media_alt: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      media_alt_ar: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      title_ar: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      sub_title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      sub_title_ar: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "product_banners",
      timestamps: true,
    },
  );

  ProductBanners.associate = (models) => {
    ProductBanners.belongsTo(models.Products, {
      foreignKey: "product_id",
      as: "product",
    });
  };

  return ProductBanners;
};
