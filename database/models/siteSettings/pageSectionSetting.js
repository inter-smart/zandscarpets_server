const { DataTypes } = require("sequelize");

// Admin override for showing a storefront page section. No row means the section is enabled.
module.exports = (sequelize) => {
  const PageSectionSetting = sequelize.define(
    "PageSectionSetting",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      page_slug: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      section_key: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "page_section_settings",
      timestamps: true,
      indexes: [
        {
          name: "page_section_settings_unique",
          unique: true,
          fields: ["page_slug", "section_key"],
        },
      ],
    },
  );

  return PageSectionSetting;
};
