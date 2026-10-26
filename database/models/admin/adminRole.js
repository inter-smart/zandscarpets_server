const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const AdminRole = sequelize.define(
    "AdminRole",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      // System roles (Admin) are locked: not editable, not deletable, bypass every permission check.
      is_system: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: "admin_roles", timestamps: true },
  );

  AdminRole.associate = (models) => {
    AdminRole.hasMany(models.AdminRolePermission, {
      foreignKey: "role_id",
      as: "permissions",
      onDelete: "CASCADE",
    });
    AdminRole.hasMany(models.AdminUser, { foreignKey: "role_id", as: "users" });
  };

  return AdminRole;
};
