const jwt = require('jsonwebtoken');
const { sendUnauthorizedError, sendForbiddenError } = require('../traits/responseHandler');
const { getUserAccess, hasAccess } = require('../../../../services/permissionService');
const { JWT_SECRET } = require('../../../../constants');

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// authMiddleware()                       → any logged-in user
// authMiddleware({ module: 'catalog' })  → dynamic RBAC: GET needs "view", writes need "manage"
// authMiddleware(['admin', 'user'])      → legacy role-name check (kept for routes not yet migrated)
module.exports = (options = []) => {
  const roles = Array.isArray(options) ? options : [];
  const module_ = Array.isArray(options) ? null : options.module;

  return async (req, res, next) => {

    try {
      // Get token from Authorization header or cookie
      const token = req.cookies?.access_token;
      if (!token) {
        return sendUnauthorizedError(res, 'Authorization token required');
      }

      // Check blacklist (optional)
      const redisClient = req.app.get('redisClient');
      if (redisClient) {
        const isBlacklisted = await redisClient.get(`blacklist:${token}`);
        if (isBlacklisted) {
          return sendUnauthorizedError(res, 'Token is blacklisted');
        }
      }

      // Verify JWT
      const decoded = jwt.verify(token, JWT_SECRET);

      if (module_) {
        // Read the user's current access from the DB/cache, not the token, so role edits apply at once.
        const access = await getUserAccess(decoded.id, redisClient);
        if (!access) {
          return sendUnauthorizedError(res, 'Account not found or inactive');
        }
        const level = READ_METHODS.has(req.method) ? 'view' : 'manage';
        if (!hasAccess(access, module_, level)) {
          return sendForbiddenError(res, `You don't have ${level} permission for this module`);
        }
        req.access = access;
      } else if (roles.length && !roles.includes(decoded.role)) {
        return sendUnauthorizedError(res, 'Insufficient permissions');
      }

      req.user = decoded;
      next();
    } catch (error) {
      console.error('Auth middleware error:', {
        message: error.message,
        timestamp: new Date().toISOString(),
      });
      return sendUnauthorizedError(res, error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token');
    }
  };
};