const { models } = require("../database/models");
const { MODULE_KEYS, READ_OPEN_MODULES } = require("../config/permissionModules");

const CACHE_TTL_SECONDS = 60;
const roleKey = (roleId) => `rbac:role:${roleId}`;
const userKey = (userId) => `rbac:user:${userId}`;

const cacheGet = async (redis, key) => {
  if (!redis?.isOpen) return null;
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const cacheSet = async (redis, key, value) => {
  if (!redis?.isOpen) return;
  try {
    await redis.set(key, JSON.stringify(value), { EX: CACHE_TTL_SECONDS });
  } catch {
    /* cache is best effort — the DB stays the source of truth */
  }
};

const cacheDel = async (redis, ...keys) => {
  if (!redis?.isOpen || keys.length === 0) return;
  try {
    await redis.del(keys);
  } catch {
    /* ignore */
  }
};

/** { id, name, slug, isSystem, modules: { key: 'view'|'manage' } } for a role, or null. */
const getRoleAccess = async (roleId, redis) => {
  if (!roleId) return null;
  const cached = await cacheGet(redis, roleKey(roleId));
  if (cached) return cached;

  const role = await models.AdminRole.findByPk(roleId, {
    include: [{ model: models.AdminRolePermission, as: "permissions" }],
  });
  if (!role) return null;

  const modules = {};
  if (role.is_system) {
    MODULE_KEYS.forEach((key) => (modules[key] = "manage"));
  } else {
    role.permissions.forEach((p) => {
      if (MODULE_KEYS.includes(p.module)) modules[p.module] = p.access;
    });
  }

  const access = { id: role.id, name: role.name, slug: role.slug, isSystem: role.is_system, modules };
  await cacheSet(redis, roleKey(roleId), access);
  return access;
};

/** Current access of a user, read from the DB (not the JWT) so edits apply immediately. */
const getUserAccess = async (userId, redis) => {
  let info = await cacheGet(redis, userKey(userId));
  if (!info) {
    const user = await models.AdminUser.findByPk(userId, { attributes: ["id", "role_id", "is_active"] });
    if (!user) return null;
    info = { roleId: user.role_id, isActive: user.is_active };
    await cacheSet(redis, userKey(userId), info);
  }
  if (!info.isActive) return null;
  return getRoleAccess(info.roleId, redis);
};

const hasAccess = (access, module, level) => {
  if (!access) return false;
  if (access.isSystem) return true;
  // Reads of lookup/dependency modules are open to every logged-in user (see permissionModules).
  if (level === "view" && READ_OPEN_MODULES.has(module)) return true;
  const have = access.modules[module];
  if (!have) return false;
  return level === "view" ? true : have === "manage";
};

/** Shape sent to the admin panel after login / refresh / me. */
const serializeUser = async (user, redis) => {
  const plain = typeof user.toJSON === "function" ? user.toJSON() : { ...user };
  const access = await getRoleAccess(plain.role_id, redis);
  const { password: _password, ...rest } = plain;
  return {
    ...rest,
    // `role` is now the role's slug (admin, staff, seo-team …); the legacy enum is not exposed.
    role: access?.slug ?? null,
    role_name: access?.name ?? null,
    is_admin: Boolean(access?.isSystem),
    permissions: access?.modules ?? {},
  };
};

const invalidateRole = (redis, roleId) => cacheDel(redis, roleKey(roleId));
const invalidateUser = (redis, userId) => cacheDel(redis, userKey(userId));

module.exports = {
  getRoleAccess,
  getUserAccess,
  hasAccess,
  serializeUser,
  invalidateRole,
  invalidateUser,
};
