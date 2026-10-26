const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const SeasonalOffer = sequelize.define(
    "seasonalOffer",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      // seconds before the popup auto-shows site-wide; null/0 disables the auto-show timer
      auto_show_delay_seconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      media_path: { type: DataTypes.STRING, allowNull: false },
      // optional portrait-ish image used below the `sm` breakpoint; falls back to media_path when empty
      mobile_media_path: { type: DataTypes.STRING, allowNull: true },
      // optional small badge graphic (e.g. "UP TO 40% OFF"), rendered in its own fixed circular frame
      badge_image: { type: DataTypes.STRING, allowNull: true },
      button_text: { type: DataTypes.STRING, allowNull: false },
      button_text_ar: { type: DataTypes.STRING, allowNull: false },
      button_link: { type: DataTypes.STRING, allowNull: false },
    },
    {
      tableName: "seasonal_offer",
      timestamps: true,
      paranoid: true,
      deletedAt: "deleted_at",
    },
  );

  return SeasonalOffer;
};
