const { validationResult } = require("express-validator");
const { sequelize, models } = require("../../../../../database/models");
const {
  sendSuccessResponse,
  sendErrorResponse,
  sendNotFoundError,
  sendValidationError,
  sendConflictError,
  sendForbiddenError,
} = require("../../traits/responseHandler");
const {
  validationRequestPost,
  validationRequestUpdate,
  validateId,
} = require("../../request/role/roleRequest");
const { MODULES } = require("../../../../../config/permissionModules");
const { invalidateRole } = require("../../../../../services/permissionService");

const { AdminRole, AdminRolePermission, AdminUser } = models;

const redisOf = (req) => req.app.get("redisClient");

const slugify = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const permissionsToMap = (rows = []) =>
  rows.reduce((acc, p) => ({ ...acc, [p.module]: p.access }), {});

const serializeRole = (role, userCount) => ({
  id: role.id,
  name: role.name,
  slug: role.slug,
  description: role.description,
  is_system: role.is_system,
  permissions: permissionsToMap(role.permissions),
  ...(userCount !== undefined && { user_count: userCount }),
  updatedAt: role.updatedAt,
});

const runValidation = async (rules, req) => {
  await Promise.all(rules.map((v) => v.run(req)));
  return validationResult(req);
};

const toRows = (roleId, permissions = {}) =>
  Object.entries(permissions).map(([module, access]) => ({ role_id: roleId, module, access }));

class RoleController {
  /** Module catalog the permission matrix is built from. */
  static async modules(req, res) {
    return sendSuccessResponse(res, MODULES, "Modules retrieved successfully");
  }

  /** Lightweight list for the role dropdown on the Users form. */
  static async options(req, res) {
    try {
      const roles = await AdminRole.findAll({
        attributes: ["id", "name", "slug", "is_system"],
        order: [
          ["is_system", "DESC"],
          ["name", "ASC"],
        ],
      });
      return sendSuccessResponse(res, roles, "Roles retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async list(req, res) {
    try {
      const roles = await AdminRole.findAll({
        include: [{ model: AdminRolePermission, as: "permissions" }],
        order: [
          ["is_system", "DESC"],
          ["name", "ASC"],
        ],
      });
      const counts = await AdminUser.findAll({
        attributes: ["role_id", [sequelize.fn("COUNT", sequelize.col("id")), "n"]],
        group: ["role_id"],
        raw: true,
      });
      const countMap = Object.fromEntries(counts.map((c) => [c.role_id, Number(c.n)]));

      return sendSuccessResponse(
        res,
        roles.map((r) => serializeRole(r, countMap[r.id] ?? 0)),
        "Roles retrieved successfully",
      );
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async getById(req, res) {
    const errors = await runValidation(validateId, req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());
    try {
      const role = await AdminRole.findByPk(req.params.id, {
        include: [{ model: AdminRolePermission, as: "permissions" }],
      });
      if (!role) return sendNotFoundError(res, "Role");
      return sendSuccessResponse(res, serializeRole(role), "Role retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async create(req, res) {
    const errors = await runValidation(validationRequestPost, req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);
    try {
      const { name, description, permissions } = req.body;
      const slug = slugify(name);
      if (!slug) return sendValidationError(res, [{ msg: "Name must contain letters or numbers" }]);

      const existing = await AdminRole.findOne({
        where: sequelize.where(sequelize.fn("lower", sequelize.col("name")), name.trim().toLowerCase()),
      });
      if (existing || (await AdminRole.findOne({ where: { slug } }))) {
        return sendConflictError(res, "Role", "A role with this name already exists");
      }

      const role = await sequelize.transaction(async (t) => {
        const created = await AdminRole.create(
          { name: name.trim(), slug, description: description ?? null },
          { transaction: t },
        );
        await AdminRolePermission.bulkCreate(toRows(created.id, permissions), { transaction: t });
        return created;
      });

      const full = await AdminRole.findByPk(role.id, {
        include: [{ model: AdminRolePermission, as: "permissions" }],
      });
      return sendSuccessResponse(res, serializeRole(full, 0), "Role created successfully", 201);
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async update(req, res) {
    const errors = await runValidation([...validateId, ...validationRequestUpdate], req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());
    try {
      const role = await AdminRole.findByPk(req.params.id);
      if (!role) return sendNotFoundError(res, "Role");
      if (role.is_system) return sendForbiddenError(res, "System roles cannot be edited");

      const { name, description, permissions } = req.body;
      const updates = {};
      if (name !== undefined && name.trim() !== role.name) {
        const slug = slugify(name);
        const clash = await AdminRole.findOne({ where: { slug } });
        if (!slug || (clash && clash.id !== role.id)) {
          return sendConflictError(res, "Role", "A role with this name already exists");
        }
        updates.name = name.trim();
        updates.slug = slug;
      }
      if (description !== undefined) updates.description = description;

      await sequelize.transaction(async (t) => {
        if (Object.keys(updates).length) await role.update(updates, { transaction: t });
        if (permissions !== undefined) {
          await AdminRolePermission.destroy({ where: { role_id: role.id }, transaction: t });
          await AdminRolePermission.bulkCreate(toRows(role.id, permissions), { transaction: t });
        }
      });
      await invalidateRole(redisOf(req), role.id);

      const full = await AdminRole.findByPk(role.id, {
        include: [{ model: AdminRolePermission, as: "permissions" }],
      });
      return sendSuccessResponse(res, serializeRole(full), "Role updated successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async destroy(req, res) {
    const errors = await runValidation(validateId, req);
    if (!errors.isEmpty()) return sendValidationError(res, errors.array());
    try {
      const role = await AdminRole.findByPk(req.params.id);
      if (!role) return sendNotFoundError(res, "Role");
      if (role.is_system) return sendForbiddenError(res, "System roles cannot be deleted");

      const users = await AdminUser.count({ where: { role_id: role.id }, paranoid: false });
      if (users > 0) {
        return sendConflictError(
          res,
          "Role",
          `This role is assigned to ${users} user${users === 1 ? "" : "s"}. Reassign them before deleting it.`,
        );
      }

      await role.destroy();
      await invalidateRole(redisOf(req), role.id);
      return sendSuccessResponse(res, null, "Role deleted successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }
}

module.exports = RoleController;
