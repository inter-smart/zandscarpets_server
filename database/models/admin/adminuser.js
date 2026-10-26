const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AdminUser = sequelize.define(
    'AdminUser',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      role: {
        type: DataTypes.ENUM('admin', 'user'),
        defaultValue: 'user',
      },
      // Legacy enum, kept for rollback only. Access is decided by role_id (admin_roles).
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'admin_roles', key: 'id' },
        onDelete: 'RESTRICT',
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: 'admin_users',
      timestamps: true,
paranoid: true,
    }
  );

  AdminUser.associate = (models) => {
    AdminUser.belongsTo(models.AdminRole, { foreignKey: 'role_id', as: 'roleInfo' });
  };

  return AdminUser;
};