const { DataTypes } = require("sequelize");
const { generateSlug } = require("../../../utils/slugHelper");

module.exports = (sequelize) => {
  const ProductLabels = sequelize.define(
    "ProductLabels",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      // Which section this label belongs to. Features, tags and specifications
      // are all the same shape (a reusable name list attached to products);
      // they differ only by this discriminator.
      type: {
        type: DataTypes.ENUM,
        values: ["feature", "tag", "specification"],
        allowNull: false,
        defaultValue: "feature",
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      title_ar: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      slug: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      is_product_badge: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      // Tags only: show this tag in the storefront listing page's filter section.
      show_in_filter: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
      tableName: "product_labels",
      timestamps: true,
      paranoid: true,
      deletedAt: "deleted_at",
      indexes: [
        {
          name: "product_labels_type_slug_active_unique",
          unique: true,
          fields: ["type", sequelize.fn("lower", sequelize.col("slug"))],
          where: { deleted_at: null },
        },
      ],
    },
  );

  ProductLabels.beforeValidate((instance) => {
    const source = instance.slug || instance.title;
    const slug = source ? generateSlug(source) : "";
    instance.slug = slug || null;
  });

  ProductLabels.associate = function (models) {
    // many to many with products
    ProductLabels.belongsToMany(models.Products, {
      through: "product_label_map",
      foreignKey: "label_id", // column pointing at ProductLabels
      otherKey: "product_id", // column pointing at Products
      as: "products",
    });
  };

  return ProductLabels;
};
