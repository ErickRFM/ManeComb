const { randomUUID } = require("crypto");
const compression = require("compression");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { CORS_ORIGIN, CLIENT_ORIGINS, TRUST_PROXY } = require("./config/env");
const accountRoutes = require("./modules/account/routes");
const {
  adminActivationKeyRoutes,
  driverActivationRoutes
} = require("./modules/activation-keys/routes");
const auditLogRoutes = require("./modules/audit-logs/routes");
const authRoutes = require("./modules/auth/routes");
const chatRoutes = require("./modules/chat/routes");
const commercialRoutes = require("./modules/commercial/routes");
const dashboardRoutes = require("./modules/dashboard/routes");
const documentRoutes = require("./modules/documents/routes");
const incidentRoutes = require("./modules/incidents/routes");
const locationRoutes = require("./modules/locations/routes");
const navigationRoutes = require("./modules/navigation/routes");
const notificationRoutes = require("./modules/notifications/routes");
const opsRoutes = require("./modules/ops/routes");
const portalRoutes = require("./modules/portal/routes");
const rtcRoutes = require("./modules/rtc/routes");
const userRoutes = require("./modules/users/routes");
const vehicleRoutes = require("./modules/vehicles/routes");
const { getStorageMode } = require("./services/storage");
const { getOrCreateTraceId, recordAppEventSafely } = require("./services/telemetry");
const { getRuntimeReadiness } = require("./services/runtime-readiness");
const { errorHandler } = require("./middlewares/error-handler");
const { notFound } = require("./middlewares/not-found");

function createApp({ store, getDbState }) {
  const app = express();
  const allowCredentials = !CLIENT_ORIGINS.includes("*");

  app.locals.store = store;
  app.locals.getDbState = getDbState;
  app.locals.io = null;
  app.set("trust proxy", TRUST_PROXY ? 1 : false);

  app.use(
    cors({
      origin: CORS_ORIGIN,
      credentials: allowCredentials
    })
  );
  app.use(
    helmet({
      crossOriginResourcePolicy: false
    })
  );
  app.use(compression());
  app.use(morgan("dev"));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    const traceId = getOrCreateTraceId(req.headers["x-trace-id"] || randomUUID());
    const startedAt = Date.now();
    req.traceId = traceId;
    res.locals.traceId = traceId;
    res.setHeader("x-trace-id", traceId);

    res.on("finish", () => {
      if (!req.path.startsWith("/api") || req.path === "/api/health") {
        return;
      }

      const durationMs = Date.now() - startedAt;
      const scope = req.path.replace(/^\/api\/?/, "").split("/")[0] || "api";
      const shouldRecord =
        res.statusCode >= 400 ||
        durationMs >= 900 ||
        ["commercial", "chat", "rtc", "incidents", "notifications", "ops"].includes(scope);

      if (!shouldRecord || !app.locals.store?.recordAppEvent) {
        return;
      }

      const level =
        res.statusCode >= 500 ? "critical" : res.statusCode >= 400 ? "warning" : "info";
      const type =
        res.statusCode >= 400 ? "api_error" : durationMs >= 900 ? "api_slow" : "api_trace";

      recordAppEventSafely(app.locals.store, {
        type,
        scope: "api",
        level,
        status: String(res.statusCode),
        route: req.originalUrl,
        method: req.method,
        userId: req.user?.id,
        durationMs,
        message: `${req.method} ${req.path} -> ${res.statusCode}`,
        metadata: {
          scope,
          statusCode: res.statusCode,
          traceId
        }
      });
    });

    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.get("/", (req, res) => {
    return res.json({
      ok: true,
      message: "API Combis operativa",
      docs: {
        rootHealth: "/health",
        health: "/api/health"
      }
    });
  });

  function handleHealth(req, res) {
    const db = getDbState();
    const readiness = getRuntimeReadiness(db);

    return res.json({
      ok: true,
      status: readiness.status,
      mode: db.mode,
      database: db.connected ? "connected" : db.mode,
      storage: getStorageMode(),
      payments: readiness.payments.mode,
      rtc: readiness.rtc.mode,
      readiness,
      timestamp: new Date().toISOString()
    });
  }

  app.get("/health", handleHealth);
  app.get("/api/health", handleHealth);

  app.use("/api/auth", authRoutes);
  app.use("/api/account", accountRoutes);
  app.use("/api/admin/activation-keys", adminActivationKeyRoutes);
  app.use("/api/audit-logs", auditLogRoutes);
  app.use("/api/commercial", commercialRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/locations", locationRoutes);
  app.use("/api/navigation", navigationRoutes);
  app.use("/api/incidents", incidentRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/documents", documentRoutes);
  app.use("/api/driver/activation", driverActivationRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/ops", opsRoutes);
  app.use("/api/portal", portalRoutes);
  app.use("/api/rtc", rtcRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/vehicles", vehicleRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
