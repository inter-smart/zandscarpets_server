const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const AdsBanner = sequelize.define(
    "AdsBanner",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      media_path: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // optional image shown on small screens instead of media_path
      mobile_media_path: {
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
      // where the banner leads when clicked
      link: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      // optional button drawn over the banner (shown only when a link is set)
      button_text: { type: DataTypes.STRING, allowNull: true },
      button_text_ar: { type: DataTypes.STRING, allowNull: true },
      link_new_tab: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      sort_order: {
        type: DataTypes.SMALLINT,
        defaultValue: 0,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      deleted_at: {
        type: DataTypes.DATE,
      },
    },
    {
      tableName: "ads_banner",
      timestamps: true,
paranoid: true,
      deletedAt: "deleted_at",
    },
  );

  return AdsBanner;
};
