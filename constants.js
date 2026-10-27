export const PORT = process.env.PORT;
export const NODE_ENV = process.env.NODE_ENV;
export const JWT_SECRET = process.env.JWT_SECRET;
export const JWT_ISSUER = process.env.JWT_ISSUER;
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
export const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";
export const DB_NAME = process.env.DB_NAME;
export const DB_USERNAME = process.env.DB_USERNAME;
export const DB_PASSWORD = process.env.DB_PASSWORD;
export const DB_HOST = process.env.DB_HOST;
export const DB_PORT = process.env.DB_PORT;
export const DATABASE_URL = process.env.DATABASE_URL;
export const DB_DIALECT = process.env.DB_DIALECT;
export const REDIS_URL = process.env.REDIS_URL;
export const SMTP_HOST = process.env.SMTP_HOST;
export const SMTP_PORT = process.env.SMTP_PORT;
export const SMTP_SECURE = process.env.SMTP_SECURE;
export const SMTP_USER = process.env.SMTP_USER;
export const SMTP_PASS = process.env.SMTP_PASS;
export const EMAIL_FROM = process.env.EMAIL_FROM;
export const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME;

export const MAIL_PROVIDER = process.env.MAIL_PROVIDER; // "smtp" (default) | "gmail" | "brevo"
export const GMAIL_SMTP_USER = process.env.GMAIL_SMTP_USER;
export const GMAIL_SMTP_PASS = process.env.GMAIL_SMTP_PASS;
export const BREVO_SMTP_HOST = process.env.BREVO_SMTP_HOST;
export const BREVO_SMTP_PORT = process.env.BREVO_SMTP_PORT;
export const BREVO_SMTP_USER = process.env.BREVO_SMTP_USER;
export const BREVO_SMTP_PASS = process.env.BREVO_SMTP_PASS;

export const BASE_URL = process.env.BASE_URL;
export const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
// Public storefront URL, used for the logo / "Visit Website" link in outgoing emails.
if (!process.env.SITE_URL) {
  throw new Error("SITE_URL env var is required (public storefront URL used in emails)");
}
export const SITE_URL = process.env.SITE_URL.replace(/\/+$/, "");

export const OTP_TTL_SECONDS = 5 * 60; // OTP + attempts counter both expire together
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_LOCKOUT_COOLDOWN_SECONDS = 5 * 60; // cooldown after hitting max attempts
export const RESET_TOKEN_TTL_SECONDS = 10 * 60;

export const ACCESS_COOKIE_NAME = "access_token";
export const REFRESH_COOKIE_NAME = "refresh_token";