const { DataTypes } = require("sequelize");

// A single downloadable file on the public Downloads page (catalogue, brochure, price list, ...).
// Flat list, no categories — title, description and one PDF per row.
module.exports = (sequelize) =>
  sequelize.define(
    "Downloads",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      title: { type: DataTypes.STRING, allowNull: false },
      title_ar: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      description_ar: { type: DataTypes.TEXT, allowNull: true },
      // optional: the file is sent to requesters by hand, so a download can exist without one
      file_path: { type: DataTypes.TEXT, allowNull: true },
      file_original_filename: { type: DataTypes.STRING, allowNull: true },
      file_size_bytes: { type: DataTypes.INTEGER, allowNull: true },
      sort_order: { type: DataTypes.SMALLINT, defaultValue: 0 },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
      deleted_at: { type: DataTypes.DATE },
    },
    {
      tableName: "downloads",
      timestamps: true,
      paranoid: true,
      deletedAt: "deleted_at",
    },
  );
