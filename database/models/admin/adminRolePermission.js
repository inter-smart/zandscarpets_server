const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const AdminRolePermission = sequelize.define(
    "AdminRolePermission",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      role_id: { type: DataTypes.INTEGER, allowNull: false },
      module: { type: DataTypes.STRING(64), allowNull: false },
      // "manage" implies "view". A missing row means no access.
      access: { type: DataTypes.ENUM("view", "manage"), allowNull: false, defaultValue: "view" },
    },
    {
      tableName: "admin_role_permissions",
      timestamps: false,
      indexes: [{ unique: true, fields: ["role_id", "module"] }],
    },
  );

  AdminRolePermission.associate = (models) => {
    AdminRolePermission.belongsTo(models.AdminRole, { foreignKey: "role_id", onDelete: "CASCADE" });
  };

  return AdminRolePermission;
};
