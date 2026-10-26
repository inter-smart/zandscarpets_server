const { DataTypes } = require("sequelize");

// A visitor asking for a downloadable file's content to be sent to them (same "lead capture, no
// automatic file" flow as SampleRequest — see sampleRequest.js). The chosen download is kept as a
// snapshot (id + title) so the request stays readable in the admin even if that download is later
// renamed or removed.
module.exports = (sequelize) =>
  sequelize.define(
    "DownloadRequest",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING, allowNull: false },
      phone: { type: DataTypes.STRING, allowNull: false },
      email: { type: DataTypes.STRING, allowNull: false },
      company_name: { type: DataTypes.STRING, allowNull: true },
      download_id: { type: DataTypes.INTEGER, allowNull: true },
      download_title: { type: DataTypes.STRING, allowNull: true },
      // Set instead of download_id/download_title when the request comes from a product's own
      // datasheet button rather than the Downloads master list (see DownloadRequestService).
      product_id: { type: DataTypes.INTEGER, allowNull: true },
      product_title: { type: DataTypes.STRING, allowNull: true },
      // Admin follow-up tracking, updated from the admin panel only.
      status: {
        type: DataTypes.ENUM("new", "shared"),
        allowNull: false,
        defaultValue: "new",
      },
      deleted_at: { type: DataTypes.DATE },
    },
    {
      tableName: "download_requests",
      timestamps: true,
      paranoid: true,
      deletedAt: "deleted_at",
    },
  );
