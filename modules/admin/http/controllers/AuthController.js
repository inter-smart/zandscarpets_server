const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");
const { Op } = require("sequelize");
const { sequelize, models } = require("../../../../database/models/index");
const {
  sendValidationError,
  sendSuccessResponse,
  sendErrorResponse,
  sendUnauthorizedError,
  sendNotFoundError,
  CustomError,
} = require("../traits/responseHandler");
const {
  validationRequestPost,
  validationLogin,
  validationForgotPassword,
  validationVerifyOtp,
  validationResetPassword,
} = require("../request/auth/AuthRequest");
const {
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  setAuthCookies,
  setAccessCookie,
  clearAuthCookies,
} = require("../traits/authCookies");
const ms = require("ms");
const Mailer = require("../../../../services/mailerServices");
const Logger = require("../../../../config/logger");
const {
  JWT_SECRET,
  JWT_ISSUER,
  OTP_TTL_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  RESET_TOKEN_TTL_SECONDS,
  OTP_LOCKOUT_COOLDOWN_SECONDS,
} = require("../../../../constants");

const AdminUser = models.AdminUser;
const AdminRefreshToken = models.AdminRefreshToken;

// Window in which a just-rotated refresh token is tolerated (concurrent refreshes).
const REFRESH_GRACE_MS = 15 * 1000;

const SAFE_USER_ATTRIBUTES = ["id", "username", "email", "role_id", "updatedAt"];
const { serializeUser } = require("../../../../services/permissionService");
const redisOf = (req) => req.app.get("redisClient");

// Password reset is limited to Admin accounts (the locked system role). The inner join on
// is_system means a non-admin never matches.
const ADMIN_ROLE_INCLUDE = [
  { model: models.AdminRole, as: "roleInfo", where: { is_system: true }, attributes: [] },
];
const findResettableAdmin = (email) =>
  AdminUser.findOne({ where: { email, is_active: true }, include: ADMIN_ROLE_INCLUDE });

const otpKey = (userId) => `pwreset:otp:${userId}`;
const otpAttemptsKey = (userId) => `pwreset:attempts:${userId}`;
const otpCooldownKey = (userId) => `pwreset:cooldown:${userId}`;
const resetTokenKey = (hashedToken) => `pwreset:token:${hashedToken}`;

const signAccessToken = (user) =>
  jwt.sign(
    { id: user.id, username: user.username, role_id: user.role_id },
    JWT_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      issuer: JWT_ISSUER || "your-app-name",
    },
  );

const hashToken = (rawToken) =>
  crypto.createHash("sha256").update(rawToken).digest("hex");

const issueRefreshToken = async (userId) => {
  const rawToken = crypto.randomBytes(40).toString("hex");
  const expiresAt = new Date(Date.now() + ms(REFRESH_TOKEN_EXPIRES_IN));

  const row = await AdminRefreshToken.create({
    userId,
    tokenHash: hashToken(rawToken),
    expiresAt,
  });

  return { rawToken, row };
};

class AuthController {
  static async register(req, res) {
    await Promise.all(validationRequestPost.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    try {
      const { username, password, email } = req.body;

      // Check existing user
      const existingUserByUsername = await AdminUser.findOne({
        where: { username },
      });
      if (existingUserByUsername) {
        return sendErrorResponse(res, new Error("Username already exists"), {
          statusCode: 409,
        });
      }

      const existingUserByEmail = await AdminUser.findOne({ where: { email } });
      if (existingUserByEmail) {
        return sendErrorResponse(res, new Error("Email already exists"), {
          statusCode: 409,
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      const defaultRole = await models.AdminRole.findOne({ where: { slug: "staff" } });
      const user = await sequelize.transaction(async (t) =>
        AdminUser.create(
          { username, email, password: hashedPassword, role_id: defaultRole?.id ?? null },
          { transaction: t },
        ),
      );

      return sendSuccessResponse(
        res,
        { user },
        "User registered successfully",
        201,
      );
    } catch (error) {
      console.error("Register error:", error);
      return sendErrorResponse(res, error);
    }
  }

  static async login(req, res) {
    await Promise.all(validationLogin.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    try {
      const { username, password } = req.body;

      // Find user by username or email in a single query
      const user = await AdminUser.findOne({
        where: {
          [Op.or]: [{ username }, { email: username }],
        },
      });

      if (!user) return sendUnauthorizedError(res, "Invalid credentials.");

      if (!user.is_active) {
        return sendUnauthorizedError(
          res,
          "Account is inactive. Please contact admin",
        );
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid)
        return sendUnauthorizedError(res, "Invalid password");

      const safeUser = await serializeUser(user, redisOf(req));

      const accessToken = signAccessToken(safeUser);
      const { rawToken: refreshToken } = await issueRefreshToken(safeUser.id);

      // Housekeeping: drop long-dead refresh rows so the table doesn't grow forever.
      AdminRefreshToken.destroy({
        where: {
          [Op.or]: [
            { expiresAt: { [Op.lt]: new Date() } },
            { revokedAt: { [Op.lt]: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
          ],
        },
      }).catch((err) => Logger.error("refresh token cleanup failed", { message: err.message }));

      setAuthCookies(res, { accessToken, refreshToken });

      // Tokens travel only in httpOnly cookies, never in the body.
      sendSuccessResponse(res, { user: safeUser }, "Login successful");
    } catch (error) {
      console.error("Login error:", error);
      sendErrorResponse(res, error);
    }
  }

  static async refresh(req, res) {
    try {
      const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
      if (!rawToken)
        return sendUnauthorizedError(res, "Refresh token required");

      const tokenHash = hashToken(rawToken);
      const existingRow = await AdminRefreshToken.findOne({
        where: { tokenHash },
      });

      if (!existingRow) {
        clearAuthCookies(res);
        return sendUnauthorizedError(res, "Invalid refresh token");
      }

      if (existingRow.expiresAt.getTime() < Date.now()) {
        clearAuthCookies(res);
        return sendUnauthorizedError(res, "Refresh token expired");
      }

      // Grace path: this token was rotated moments ago by a concurrent request
      // (two tabs / parallel 401s). The browser already holds the newer refresh
      // cookie from that response, so just hand back a fresh access token and
      // leave the refresh cookie alone. Not treated as theft.
      const respondConcurrentRefresh = async () => {
        const user = await AdminUser.findOne({
          where: { id: existingRow.userId, is_active: true },
          attributes: SAFE_USER_ATTRIBUTES,
        });
        if (!user) {
          clearAuthCookies(res);
          return sendUnauthorizedError(res, "User not found");
        }
        setAccessCookie(res, signAccessToken(user));
        return sendSuccessResponse(
          res,
          { user: await serializeUser(user, redisOf(req)) },
          "Token refreshed",
        );
      };

      if (existingRow.revokedAt) {
        const rotatedRecently =
          existingRow.replacedByTokenId &&
          Date.now() - existingRow.revokedAt.getTime() < REFRESH_GRACE_MS;
        if (rotatedRecently) return await respondConcurrentRefresh();

        // Reuse of an already-rotated/revoked refresh token — likely theft/replay.
        // Revoke every outstanding token for this user as a precaution.
        await AdminRefreshToken.update(
          { revokedAt: new Date() },
          { where: { userId: existingRow.userId, revokedAt: null } },
        );
        clearAuthCookies(res);
        return sendUnauthorizedError(
          res,
          "Session invalid, please log in again",
        );
      }

      const user = await AdminUser.findOne({
        where: { id: existingRow.userId, is_active: true },
        attributes: SAFE_USER_ATTRIBUTES,
      });

      if (!user) {
        clearAuthCookies(res);
        return sendUnauthorizedError(res, "User not found");
      }

      // Atomically claim the token: only one concurrent request can flip
      // revokedAt from NULL, the rest see 0 affected rows.
      const rotated = await sequelize.transaction(async (t) => {
        const [claimed] = await AdminRefreshToken.update(
          { revokedAt: new Date() },
          { where: { id: existingRow.id, revokedAt: null }, transaction: t },
        );
        if (!claimed) return null;

        const rawNew = crypto.randomBytes(40).toString("hex");
        const newRow = await AdminRefreshToken.create(
          {
            userId: user.id,
            tokenHash: hashToken(rawNew),
            expiresAt: new Date(Date.now() + ms(REFRESH_TOKEN_EXPIRES_IN)),
          },
          { transaction: t },
        );
        await AdminRefreshToken.update(
          { replacedByTokenId: newRow.id },
          { where: { id: existingRow.id }, transaction: t },
        );
        return rawNew;
      });

      if (!rotated) return await respondConcurrentRefresh();

      setAuthCookies(res, {
        accessToken: signAccessToken(user),
        refreshToken: rotated,
      });

      sendSuccessResponse(
        res,
        { user: await serializeUser(user, redisOf(req)) },
        "Token refreshed",
      );
    } catch (error) {
      console.error("Refresh error:", error);
      sendErrorResponse(res, error);
    }
  }

  static async logout(req, res) {
    try {
      const accessToken =
        req.headers.authorization?.split(" ")[1] ||
        req.cookies?.[ACCESS_COOKIE_NAME];
      const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

      if (refreshToken) {
        const tokenHash = hashToken(refreshToken);
        await AdminRefreshToken.update(
          { revokedAt: new Date() },
          { where: { tokenHash, revokedAt: null } },
        );
      }

      if (accessToken) {
        const redisClient = req.app.get("redisClient");
        if (redisClient) {
          try {
            const decoded = jwt.decode(accessToken);
            const ttlSeconds = decoded?.exp
              ? Math.max(decoded.exp - Math.floor(Date.now() / 1000), 1)
              : ms(ACCESS_TOKEN_EXPIRES_IN) / 1000;
            await redisClient.set(`blacklist:${accessToken}`, "1", {
              EX: ttlSeconds,
            });
          } catch (err) {
            console.error("Logout blacklist error:", err.message);
          }
        }
      }

      clearAuthCookies(res);
      sendSuccessResponse(res, null, "Logout successful");
    } catch (error) {
      console.error("Logout error:", error);
      // Logout should never fail from the client's perspective.
      clearAuthCookies(res);
      sendSuccessResponse(res, null, "Logout successful");
    }
  }

  static async me(req, res) {
    try {
      const user = await AdminUser.findOne({
        where: { id: req.user.id, is_active: true },
        attributes: SAFE_USER_ATTRIBUTES,
      });

      if (!user) return sendUnauthorizedError(res, "User not found");

      sendSuccessResponse(
        res,
        { user: await serializeUser(user, redisOf(req)) },
        "Current user",
      );
    } catch (error) {
      console.error("Me error:", error);
      sendErrorResponse(res, error);
    }
  }

  // Handles both the initial OTP send and any resend request — same idempotent
  // behavior either way, so the frontend can call this endpoint for "Resend OTP" too.
  static async forgotPassword(req, res) {
    await Promise.all(validationForgotPassword.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    try {
      const { email } = req.body;

      const user = await findResettableAdmin(email);
      if (!user) {
        // Explicitly tell the user when the email isn't registered, per product decision;
        // an existing non-admin account gets a distinct message and no OTP is generated.
        const exists = await AdminUser.count({ where: { email, is_active: true } });
        if (exists) {
          return sendErrorResponse(
            res,
            new CustomError(
              "Password reset is only available for admin accounts. Please contact your administrator.",
              403,
              "NOT_ADMIN",
            ),
          );
        }
        return sendErrorResponse(
          res,
          new CustomError(
            "This email is not registered",
            404,
            "EMAIL_NOT_FOUND",
          ),
        );
      }

      const redisClient = req.app.get("redisClient");
      if (!redisClient) {
        Logger.error("forgotPassword: redisClient unavailable");
        return sendErrorResponse(
          res,
          new CustomError(
            "Service temporarily unavailable",
            503,
            "SERVICE_UNAVAILABLE",
          ),
        );
      }

      const existingCooldownTtl = await redisClient.ttl(
        otpCooldownKey(user.id),
      );
      if (existingCooldownTtl > 0) {
        return sendErrorResponse(
          res,
          new CustomError(
            "Too many request attempts. Wait for a while before trying again",
            429,
            "OTP_COOLDOWN",
            {
              cooldownSeconds: existingCooldownTtl,
            },
          ),
        );
      }

      const otp = crypto.randomInt(100000, 1000000).toString();
      await redisClient.set(otpKey(user.id), hashToken(otp), {
        EX: OTP_TTL_SECONDS,
      });
      await redisClient.del(otpAttemptsKey(user.id));

      try {
        await Mailer.sendOtpEmail(user.email, otp);
      } catch (mailError) {
        Logger.error("forgotPassword: failed to send OTP email", {
          message: mailError.message,
        });
        return sendErrorResponse(
          res,
          new CustomError(
            "Failed to send verification code",
            500,
            "EMAIL_SEND_FAILED",
          ),
        );
      }

      // Cooldown only starts counting once the email has actually been sent.
      await redisClient.set(otpCooldownKey(user.id), "1", {
        EX: OTP_RESEND_COOLDOWN_SECONDS,
      });

      return sendSuccessResponse(
        res,
        {
          cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
          expiresInSeconds: OTP_TTL_SECONDS,
          maxAttempts: OTP_MAX_ATTEMPTS,
          lockoutSeconds: OTP_LOCKOUT_COOLDOWN_SECONDS,
        },
        "Verification code sent to your email",
      );
    } catch (error) {
      console.error("Forgot password error:", error);
      sendErrorResponse(res, error);
    }
  }

  static async verifyOtp(req, res) {
    await Promise.all(validationVerifyOtp.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    try {
      const { email, otp } = req.body;
      const invalidOtpError = () =>
        sendErrorResponse(
          res,
          new CustomError("Invalid or expired code", 400, "OTP_INVALID"),
        );

      const user = await findResettableAdmin(email);
      if (!user) return invalidOtpError();

      const redisClient = req.app.get("redisClient");
      if (!redisClient) {
        Logger.error("verifyOtp: redisClient unavailable");
        return sendErrorResponse(
          res,
          new CustomError(
            "Service temporarily unavailable",
            503,
            "SERVICE_UNAVAILABLE",
          ),
        );
      }

      const storedHash = await redisClient.get(otpKey(user.id));
      if (!storedHash) return invalidOtpError();

      if (storedHash !== hashToken(otp)) {
        const attempts = await redisClient.incr(otpAttemptsKey(user.id));
        // Attempts counter should expire alongside the OTP itself.
        await redisClient.expire(otpAttemptsKey(user.id), OTP_TTL_SECONDS);

        if (attempts >= OTP_MAX_ATTEMPTS) {
          await redisClient.del(otpKey(user.id));
          await redisClient.del(otpAttemptsKey(user.id));
          // Lock out resends for longer after burning all attempts.
          await redisClient.set(otpCooldownKey(user.id), "1", {
            EX: OTP_LOCKOUT_COOLDOWN_SECONDS,
          });
          return sendErrorResponse(
            res,
            new CustomError(
              "Too many incorrect attempts. Please request a new code.",
              429,
              "OTP_MAX_ATTEMPTS",
              {
                cooldownSeconds: OTP_LOCKOUT_COOLDOWN_SECONDS,
              },
            ),
          );
        }

        return sendErrorResponse(
          res,
          new CustomError("Incorrect code", 400, "OTP_INVALID", {
            remainingAttempts: OTP_MAX_ATTEMPTS - attempts,
          }),
        );
      }

      // Correct OTP — burn it and issue a single-use reset token.
      await redisClient.del(otpKey(user.id));
      await redisClient.del(otpAttemptsKey(user.id));

      const rawResetToken = crypto.randomBytes(32).toString("hex");
      await redisClient.set(
        resetTokenKey(hashToken(rawResetToken)),
        String(user.id),
        { EX: RESET_TOKEN_TTL_SECONDS },
      );

      sendSuccessResponse(
        res,
        { resetToken: rawResetToken, expiresInSeconds: RESET_TOKEN_TTL_SECONDS },
        "Code verified",
      );
    } catch (error) {
      console.error("Verify OTP error:", error);
      sendErrorResponse(res, error);
    }
  }

  static async resetPassword(req, res) {
    await Promise.all(validationResetPassword.map((v) => v.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) return sendValidationError(res, errors);

    try {
      const { email, resetToken, password } = req.body;

      const user = await findResettableAdmin(email);
      if (!user) {
        return sendErrorResponse(
          res,
          new CustomError("Invalid or expired reset token", 400, "RESET_TOKEN_INVALID"),
        );
      }

      const redisClient = req.app.get("redisClient");
      if (!redisClient) {
        Logger.error("resetPassword: redisClient unavailable");
        return sendErrorResponse(
          res,
          new CustomError(
            "Service temporarily unavailable",
            503,
            "SERVICE_UNAVAILABLE",
          ),
        );
      }

      const tokenKey = resetTokenKey(hashToken(resetToken));
      const storedUserId = await redisClient.get(tokenKey);
      if (!storedUserId || Number(storedUserId) !== user.id) {
        return sendErrorResponse(
          res,
          new CustomError(
            "Invalid or expired reset token",
            400,
            "RESET_TOKEN_INVALID",
          ),
        );
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      await sequelize.transaction(async (t) => {
        user.password = hashedPassword;
        await user.save({ transaction: t });

        // Revoke every outstanding session — a leaked old refresh token
        // shouldn't survive a password reset.
        await AdminRefreshToken.update(
          { revokedAt: new Date() },
          { where: { userId: user.id, revokedAt: null }, transaction: t },
        );
      });

      await redisClient.del(tokenKey);

      sendSuccessResponse(res, null, "Password reset successful");
    } catch (error) {
      console.error("Reset password error:", error);
      sendErrorResponse(res, error);
    }
  }
}

module.exports = AuthController;
