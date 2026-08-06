const { randomUUID } = require("crypto");
const compression = require("compression");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const packageJson = require("../package.json");
const {
  CORS_ORIGIN,
  CLIENT_ORIGINS,
  NODE_ENV,
  TRUST_PROXY
} = require("./config/env");
const accountRoutes = require("./modules/account/routes");
const accountSecurityRoutes = require("./modules/account-security/routes");
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
const platformAuthRoutes = require("./modules/platform/auth-routes");
const platformBaseRoutes = require("./modules/platform");
const opsRoutes = require("./modules/ops/routes");
const operationalUnitRoutes = require("./modules/operational-units/routes");
const portalRoutes = require("./modules/portal/routes");
const appRoutes = require("./modules/app/routes");
const radioRoutes = require("./modules/radio/routes");
const rtcRoutes = require("./modules/rtc/routes");
const userRoutes = require("./modules/users/routes");
const vehicleRoutes = require("./modules/vehicles/routes");
const { getOrCreateTraceId, recordAppEventSafely } = require("./services/telemetry");
const { getRuntimeReadiness } = require("./services/runtime-readiness");
const logger = require("./services/logger");
const {
  getMetricsSnapshot,
  incrementMetric,
  observeDuration,
  setGauge
} = require("./services/metrics");
const { errorHandler } = require("./middlewares/error-handler");
const { notFound } = require("./middlewares/not-found");
const { platformAccess } = require("./middlewares/platform-access");

function createApp({ store, getDbState }) {
  const app = express();
  const allowCredentials = !CLIENT_ORIGINS.includes("*");
  const corsOptions = {
    origin: CORS_ORIGIN,
    credentials: allowCredentials,
    optionsSuccessStatus: 204
  };

  app.locals.store = store;
  app.locals.getDbState = getDbState;
  app.locals.io = null;
  app.set("trust proxy", TRUST_PROXY ? 1 : false);

  app.use(cors(corsOptions));
  app.options(/.*/, cors(corsOptions));
  app.use(
    helmet({
      crossOriginResourcePolicy: false
    })
  );
  app.use(compression());
  app.use(
    morgan("dev", {
      skip: () => NODE_ENV === "production"
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    const traceId = getOrCreateTraceId(req.headers["x-trace-id"] || randomUUID());
    const startedAt = Date.now();
    req.traceId = traceId;
    res.locals.traceId = traceId;
    res.setHeader("x-trace-id", traceId);

    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      const routeScope = req.path.replace(/^\/api\/?/, "").split("/")[0] || "api";
      const statusFamily = `${Math.floor(res.statusCode / 100)}xx`;
      incrementMetric("http_requests_total", 1, {
        method: req.method,
        scope: routeScope,
        status: statusFamily
      });
      if (res.statusCode < 400) {
        if (routeScope === "locations" && req.method !== "GET") {
          incrementMetric("gps_updates_total", 1, { transport: "http" });
        }
        if (routeScope === "chat" && req.method !== "GET") {
          incrementMetric("chat_messages_total", 1, { transport: "http" });
        }
        if (routeScope === "radio" && req.method !== "GET") {
          incrementMetric("radio_transmissions_total", 1, { transport: "http" });
        }
        if (routeScope === "incidents" && req.method === "POST") {
          incrementMetric("incidents_created_total", 1);
        }
        if (routeScope === "commercial" && req.method !== "GET") {
          incrementMetric("payments_events_total", 1);
        }
        if (routeScope === "documents" && req.method !== "GET") {
          incrementMetric("uploads_total", 1, { scope: "documents" });
        }
        if (routeScope === "notifications" && req.method !== "GET") {
          incrementMetric("notifications_events_total", 1);
        }
        if (routeScope === "auth" && req.method !== "GET") {
          incrementMetric("auth_events_total", 1);
        }
      }
      observeDuration("http_request_duration_ms", durationMs, {
        method: req.method,
        scope: routeScope
      });

      if (!req.path.startsWith("/api") || req.path === "/api/health") {
        return;
      }

      const scope = req.path.replace(/^\/api\/?/, "").split("/")[0] || "api";
      const shouldRecord =
        res.statusCode >= 400 ||
        durationMs >= 900 ||
        ["commercial", "chat", "radio", "rtc", "incidents", "notifications", "ops"].includes(scope);

      if (!shouldRecord || !app.locals.store?.recordAppEvent) {
        return;
      }

      const level =
        res.statusCode >= 500 ? "critical" : res.statusCode >= 400 ? "warning" : "info";
      const type =
        res.statusCode >= 400 ? "api_error" : durationMs >= 900 ? "api_slow" : "api_trace";

      logger.log(level === "critical" ? "error" : level === "warning" ? "warn" : "info", {
        action: "HttpRequest",
        durationMs,
        metadata: {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode
        },
        module: scope,
        organizationId: req.user?.organizationId,
        requestId: traceId,
        status: String(res.statusCode),
        userId: req.user?.id
      });

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

  function handleHealth(req, res, detailed = false) {
    const db = getDbState();
    const readiness = getRuntimeReadiness(db);
    const socketServer = app.locals.io;
    const socketCount = socketServer?.engine?.clientsCount || 0;
    setGauge("socket_clients", socketCount);

    const payload = {
      ok: true,
      status: readiness.status,
      version: packageJson.version,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    };
    if (detailed) {
      payload.communication = readiness.communication;
    }
    return res.json(payload);
  }

  app.get("/health", (req, res) => handleHealth(req, res));
  app.get("/api/health", (req, res) => handleHealth(req, res));
  app.get("/api/health/live", (req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));
  app.get("/api/health/ready", (req, res) => handleHealth(req, res, true));
  app.get("/api/metrics", (req, res) => {
    setGauge("socket_clients", app.locals.io?.engine?.clientsCount || 0);
    res.json({
      ok: true,
      data: getMetricsSnapshot()
    });
  });

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
  app.use("/api/platform", platformAccess);
  app.use("/api/platform/auth", platformAuthRoutes);
  app.use("/api/platform", platformBaseRoutes);
  app.use("/api/ops", opsRoutes);
  app.use("/api/operational-units", operationalUnitRoutes);
  app.use("/api/portal", portalRoutes);
  app.use("/api/app", appRoutes);
  app.use("/api/radio", radioRoutes);
  app.use("/api/rtc", rtcRoutes);
  app.use("/api/users/me", accountSecurityRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/vehicles", vehicleRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
