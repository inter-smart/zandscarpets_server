const bcrypt = require("bcrypt");
const { Op } = require("sequelize");
const { models } = require("../../../../../database/models");
const {
  sendSuccessResponse,
  sendErrorResponse,
  sendNotFoundError,
  sendValidationError,
  sendConflictError,
} = require("../../traits/responseHandler");
const { paginate } = require("../../traits/datatablePaginationHelper");
const {
  validationRequestPost,
  validationRequestUpdate,
  validateId,
} = require("../../request/user/userRequest");
const { validationResult } = require("express-validator");

const dataModel = models.AdminUser;
const { AdminRole } = models;
const { invalidateUser } = require("../../../../../services/permissionService");

const redisOf = (req) => req.app.get("redisClient");
const roleInclude = [{ model: AdminRole, as: "roleInfo", attributes: ["id", "name", "slug", "is_system"] }];

/** Active users currently holding a system (Admin) role, excluding `exceptId`. */
const otherActiveAdmins = (exceptId) =>
  dataModel.count({
    where: { is_active: true, ...(exceptId && { id: { [Op.ne]: exceptId } }) },
    include: [{ model: AdminRole, as: "roleInfo", where: { is_system: true }, attributes: [] }],
  });

const SAFE_ATTRIBUTES = ["id", "username", "email", "role_id", "is_active", "updatedAt"];

const BCRYPT_ROUNDS = 12;

class UserController {
  static async list(req, res) {
    try {
      const result = await paginate(dataModel, req, {
        order: [["id", "ASC"]],
        searchFields: ["username", "email"],
        attributes: SAFE_ATTRIBUTES,
        include: roleInclude,
      });

      sendSuccessResponse(res, result, "User list retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async getById(req, res) {
    await Promise.all(validateId.map((validation) => validation.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendValidationError(res, errors.array());
    }
    try {
      const { id } = req.params;

      const item = await dataModel.findByPk(id, { attributes: SAFE_ATTRIBUTES, include: roleInclude });
      if (!item) {
        return sendNotFoundError(res, "User");
      }

      sendSuccessResponse(res, item, "User retrieved successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async create(req, res) {
    try {
      await Promise.all(validationRequestPost.map((v) => v.run(req)));
      const errors = validationResult(req);
      if (!errors.isEmpty()) return sendValidationError(res, errors);

      const { username, email, password, role_id, is_active } = req.body;

      let roleId = role_id;
      if (roleId === undefined) {
        roleId = (await AdminRole.findOne({ where: { slug: "staff" } }))?.id;
      } else if (!(await AdminRole.findByPk(roleId))) {
        return sendValidationError(res, [{ msg: "Selected role does not exist", path: "role_id" }]);
      }

      const existingByUsername = await dataModel.findOne({ where: { username } });
      if (existingByUsername) {
        return sendConflictError(res, "User", "Username already exists");
      }

      const existingByEmail = await dataModel.findOne({ where: { email } });
      if (existingByEmail) {
        return sendConflictError(res, "User", "Email already exists");
      }

      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const item = await dataModel.create({
        username,
        email,
        password: hashedPassword,
        role_id: roleId ?? null,
        ...(is_active !== undefined && { is_active }),
      });

      const { password: _password, ...safeUser } = item.toJSON();

      sendSuccessResponse(res, safeUser, "User created successfully", 201);
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async update(req, res) {
    await Promise.all(
      [...validateId, ...validationRequestUpdate].map((v) => v.run(req)),
    );
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendValidationError(res, errors.array());
    }

    try {
      const { id } = req.params;
      const { username, email, password, role_id, is_active } = req.body;

      const item = await dataModel.findByPk(id, { include: roleInclude });
      if (!item) {
        return sendNotFoundError(res, "User");
      }

      if (username && username !== item.username) {
        const existingByUsername = await dataModel.findOne({ where: { username } });
        if (existingByUsername) {
          return sendConflictError(res, "User", "Username already exists");
        }
      }

      if (email && email !== item.email) {
        const existingByEmail = await dataModel.findOne({ where: { email } });
        if (existingByEmail) {
          return sendConflictError(res, "User", "Email already exists");
        }
      }
      // DO not set status false of  the admin user
      if(req.user.id == id && is_active === false){
        return sendConflictError(res, "User", "You cannot disable your own account");
      }

      if (role_id !== undefined && role_id !== item.role_id) {
        if (Number(req.user.id) === Number(id)) {
          return sendConflictError(res, "User", "You cannot change your own role");
        }
        if (!(await AdminRole.findByPk(role_id))) {
          return sendValidationError(res, [{ msg: "Selected role does not exist", path: "role_id" }]);
        }
      }

      // Never leave the system without an active Admin.
      const holdsAdmin = item.roleInfo?.is_system && item.is_active;
      const losesAdmin =
        (role_id !== undefined && role_id !== item.role_id) || is_active === false;
      if (holdsAdmin && losesAdmin && (await otherActiveAdmins(item.id)) === 0) {
        return sendConflictError(res, "User", "At least one active Admin is required");
      }

      const updates = {
        ...(username !== undefined && { username }),
        ...(email !== undefined && { email }),
        ...(role_id !== undefined && { role_id }),
        ...(is_active !== undefined && { is_active }),
      };

      // Only re-hash/overwrite the password when one was actually supplied.
      if (password) {
        updates.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
      }

      await item.update(updates);
      await invalidateUser(redisOf(req), item.id);

      const { password: _password, ...safeUser } = item.toJSON();

      sendSuccessResponse(res, safeUser, "User updated successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }

  static async destroy(req, res) {
    await Promise.all(validateId.map((validation) => validation.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendValidationError(res, errors.array());
    }
    try {
      const { id } = req.params;

      if (req.user && Number(req.user.id) === Number(id)) {
        return sendConflictError(res, "User", "You cannot delete your own account");
      }

      const item = await dataModel.findByPk(id, { include: roleInclude });
      if (!item) {
        return sendNotFoundError(res, "User");
      }

      if (item.roleInfo?.is_system && item.is_active && (await otherActiveAdmins(item.id)) === 0) {
        return sendConflictError(res, "User", "At least one active Admin is required");
      }

      await item.destroy();
      await invalidateUser(redisOf(req), item.id);

      sendSuccessResponse(res, null, "User deleted successfully");
    } catch (error) {
      return sendErrorResponse(res, error);
    }
  }
}

module.exports = UserController;
