const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const { sequelize } = require("./database/models");
const backendApi = require("./modules/admin/routes/index");
const frontendApi = require("./modules/frontend/routes/index");
const errorMiddleware = require("./modules/admin/http/middleware/errorMiddleware");
const Logger = require("./config/logger");
const path = require("path");
const cors = require("cors");
const expressListEndpoints = require("express-list-endpoints");
const cookieParser = require("cookie-parser");
const { createClient } = require("redis");
const { connectRedis, disconnectRedis } = require("./config/redisClient");
const { createAdminUser } = require("./database/seeders/adminUser");
const { seedCurrentPages } = require("./database/seeders/pagesCurrent");
const { seedMetaTags } = require("./database/seeders/metaTags");
const { PORT, REDIS_URL } = require("./constants");

const app = express();

const allowedOrigins = ["http://localhost:3000", "http://localhost:5173", "http://localhost:8080", "https://zands.admin.intersmarthosting.in","https://zands-uat.netlify.app", "https://zands.intersmarthosting.in"];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy does not allow access from: ${origin}`), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const redisClient = createClient({ url: REDIS_URL });

redisClient
  .connect()
  .then(async () => {
    Logger.info("✅ Redis connected");
    app.set("redisClient", redisClient);
  })
  .catch((err) => Logger.error("❌ Redis connection failed:", err.message));

// ✅ Register routes BEFORE listing endpoints
app.use("/api/backend", backendApi);
app.use("/api/frontend", frontendApi);

// Error handler last
app.use(errorMiddleware);

const colors = {
  green: (str) => (process.stdout.isTTY ? `\x1b[32m${str}\x1b[0m` : str),
  red: (str) => (process.stdout.isTTY ? `\x1b[31m${str}\x1b[0m` : str),
  yellow: (str) => (process.stdout.isTTY ? `\x1b[33m${str}\x1b[0m` : str),
  cyan: (str) => (process.stdout.isTTY ? `\x1b[36m${str}\x1b[0m` : str),
  gray: (str) => (process.stdout.isTTY ? `\x1b[90m${str}\x1b[0m` : str),
};

const startServer = async () => {
  const startTime = Date.now();

  try {
    await connectRedis();
    Logger.info(colors.green("✓ Redis connected"));

    try {
      await sequelize.authenticate();
      Logger.info(colors.green("✓ Database connected"));
    } catch (dbError) {
      Logger.error(colors.red(`✗ Database connection failed — ${dbError.message}`));
      throw dbError;
    }

    // await createAdminUser();
    // await seedCurrentPages({ overwrite: false });
    // await seedMetaTags();

    // Fail loudly if any routes failed to load during require()
    const routeFailures = backendApi.errorReport ? backendApi._routeErrors : null;
    if (routeFailures && routeFailures.length) {
      Logger.error(colors.red(`✗ ${routeFailures.length} route(s) failed to load — refusing to start`));
      routeFailures.forEach((e) => {
        Logger.error(colors.red(`   ${e.route} — ${e.reason} [${path.basename(e.file)}]`));
      });
      process.exit(1);
    }

    app.listen(PORT, () => {
      const bootTime = Date.now() - startTime;
      Logger.info(colors.cyan(`🚀 Server running on port ${PORT}`) + colors.gray(` (${bootTime}ms)`));

      const endpoints = expressListEndpoints(app);

      const printEndpoints = (label, list, prefix = "") => {
        if (!list.length) return;
        Logger.info(colors.cyan(`\n📋 ${label} (${list.length}):`));
        list.forEach((e) => {
          Logger.info(`  ${colors.gray(e.methods.join(", ").padEnd(20))} ${prefix}${e.path}`);
        });
      };

      if (!endpoints.length) {
        Logger.warn(colors.yellow("⚠ No endpoints found at app level. Checking sub-routers..."));

        const backendEndpoints = expressListEndpoints(backendApi);
        const frontendEndpoints = expressListEndpoints(frontendApi);

        printEndpoints("Backend Endpoints", backendEndpoints, "/api/backend");
        printEndpoints("Frontend Endpoints", frontendEndpoints, "/api/frontend");

        if (!backendEndpoints.length && !frontendEndpoints.length) {
          Logger.error(colors.red("✗ No endpoints registered anywhere — check route loading above"));
        }
      } else {
        printEndpoints("Registered Endpoints", endpoints);
      }

      // Logger.info("");
    });
  } catch (error) {
    Logger.error(colors.red(`✗ Failed to start server — ${error.message}`));
    process.exit(1);
  }
};

startServer();

process.on("SIGINT", async () => {
  await sequelize.close();
  await disconnectRedis();
  process.exit(0);
});
