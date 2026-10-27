const { DataTypes } = require("sequelize");

// Central table for uploaded detail-content files (images/videos), so a
// file can be referenced by more than one detail item. This is a deliberate
// exception to this codebase's usual convention of embedding media columns
// directly on the owning table (see product_variants,
// attribute_values) — scoped only to the dynamic-details feature, where
// reuse across items is worth the extra join. No `paranoid`: this is a leaf
// asset row, hard-deleted once nothing references it (see mediaController
// and detailsOrphanMediaCleanupService).
module.exports = (sequelize) => {
  const Media = sequelize.define(
    "Media",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      kind: {
        type: DataTypes.ENUM,
        values: ["image", "video"],
        allowNull: false,
      },
      location: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      mime_type: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      size_bytes: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      alt_text: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      alt_text_ar: { type: DataTypes.STRING, allowNull: true },
      title_ar: { type: DataTypes.STRING, allowNull: true },
      description_ar: { type: DataTypes.TEXT, allowNull: true },
      thumbnail_location: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "media",
      timestamps: true,
      indexes: [{ name: "media_kind", fields: ["kind"] }],
    },
  );

  Media.associate = function (models) {
    Media.hasMany(models.DetailItems, {
      foreignKey: "media_id",
      as: "detailItems",
    });
  };

  return Media;
};
