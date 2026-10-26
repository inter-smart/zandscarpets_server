// One-off, idempotent migration for dynamic RBAC.
//   node scripts/migrateRbac.js
// 1. creates admin_roles / admin_role_permissions and admin_users.role_id (sequelize.sync, additive)
// 2. seeds the locked "Admin" role and a "Staff" role (everything except Users / Roles)
// 3. backfills admin_users.role_id from the legacy `role` enum (admin → Admin, user → Staff)
// The legacy `role` column is left untouched.
const { sequelize, models } = require("../database/models");
const { MODULE_KEYS } = require("../config/permissionModules");

const STAFF_EXCLUDED = ["users", "roles"];

(async () => {
  try {
    await sequelize.authenticate();
    await models.AdminRole.sync();
    await models.AdminRolePermission.sync();
    await models.AdminUser.sync({ alter: true });

    const [adminRole] = await models.AdminRole.findOrCreate({
      where: { slug: "admin" },
      defaults: { name: "Admin", description: "Full access. Locked role.", is_system: true },
    });
    if (!adminRole.is_system) await adminRole.update({ is_system: true });

    const [staffRole, staffCreated] = await models.AdminRole.findOrCreate({
      where: { slug: "staff" },
      defaults: { name: "Staff", description: "Everything except user and role management." },
    });
    if (staffCreated) {
      await models.AdminRolePermission.bulkCreate(
        MODULE_KEYS.filter((key) => !STAFF_EXCLUDED.includes(key)).map((module) => ({
          role_id: staffRole.id,
          module,
          access: "manage",
        })),
      );
    }

    await sequelize.query(
      `UPDATE admin_users SET role_id = :id WHERE role_id IS NULL AND role = 'admin'`,
      { replacements: { id: adminRole.id } },
    );
    await sequelize.query(
      `UPDATE admin_users SET role_id = :id WHERE role_id IS NULL`,
      { replacements: { id: staffRole.id } },
    );

    const total = await models.AdminUser.count({ paranoid: false });
    const unassigned = await models.AdminUser.count({ where: { role_id: null }, paranoid: false });
    console.log(
      `RBAC migration done. roles: Admin#${adminRole.id}, Staff#${staffRole.id}. users: ${total} total, ${unassigned} without role_id.`,
    );
    process.exit(unassigned === 0 ? 0 : 1);
  } catch (error) {
    console.error("RBAC migration failed:", error);
    process.exit(1);
  }
})();
