const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const { enterpriseRateLimit } = require("../../middlewares/enterprise-rate-limit");
const { buildAuthContext } = require("../../services/auth-context");
const { recordAuditLog } = require("../../services/audit");
const {
  createSessionForRequest,
  revokeAllSessions,
  revokeRefreshToken,
  rotateRefreshToken
} = require("../../services/sessions");
const { buildAuthSession } = require("../../utils/jwt");
const { RESEND_API_KEY, RESEND_FROM_EMAIL, APP_URL } = require("../../config/env");
const communication = require("../../../modules/communication");
const logger = require("../../services/logger");

function compareVersions(a, b) {
  const pa = String(a || "0.0.0").split(".").map(Number);
  const pb = String(b || "0.0.0").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function getAppUpdateInfo(store, currentVersion) {
  try {
    const appConfig = store?.getAppConfig ? store.getAppConfig() : null;
    if (!appConfig) return {};

    const publishedVersion = appConfig.version;
    if (!publishedVersion) return {};

    const comparison = compareVersions(currentVersion, publishedVersion);

    if (comparison >= 0) {
      return { updateAvailable: false };
    }

    const latestEntry = Array.isArray(appConfig.versionHistory)
      ? appConfig.versionHistory.find((v) => v.version === publishedVersion)
      : null;

    return {
      updateAvailable: true,
      latestVersion: publishedVersion,
      mandatory: latestEntry ? Boolean(latestEntry.mandatory) : false,
      releaseNotes: appConfig.releaseNotes || [],
      downloadUrl: appConfig.apkUrl || "",
    };
  } catch (e) {
    return {};
  }
}

const router = Router();
const authLimiter = enterpriseRateLimit({ scope: "auth", max: 20, windowMs: 60 * 1000 });
const refreshLimiter = enterpriseRateLimit({ scope: "auth-refresh", max: 30, windowMs: 60 * 1000 });

function shouldLogAuthAccessDecision() {
  return process.env.AUTH_ACCESS_DEBUG === "true" || process.env.NODE_ENV === "development";
}

function logAuthAccessDecision(source, user, authContext) {
  if (!shouldLogAuthAccessDecision()) {
    return;
  }

  logger.debug({
    action: "AuthAccessDecision",
    metadata: {
      canAccessMobile: authContext?.canAccessMobile ?? null,
      email: user?.email || null,
      mobileBlockReason: authContext?.mobileBlockReason || null,
      source,
      subscriptionIsActive: authContext?.subscription?.isActive ?? null,
      subscriptionStatus: authContext?.subscription?.status || null,
      tenantStatus: authContext?.tenant?.status || null
    },
    module: "Auth",
    organizationId: user?.organizationId,
    status: authContext?.canAccessMobile ? "allowed" : "blocked",
    userId: user?.id
  });
}

function buildAuthContextPayload(authContext) {
  return {
    authContext,
    canAccessMobile: authContext.canAccessMobile,
    mobileBlockReason: authContext.mobileBlockReason,
    tenant: authContext.tenant,
    subscription: authContext.subscription,
    onboarding: authContext.onboarding,
    postLoginRoute: authContext.route
  };
}

async function buildLoginResponse(req, res, user, statusCode = 200, action = "auth.login") {
  const refresh = await createSessionForRequest(req, user);
  const session = buildAuthSession(user, refresh.session.id);
  const authContext = await buildAuthContext(req.app.locals.store, user);
  logAuthAccessDecision(action, user, authContext);

  await recordAuditLog(req, {
    actorId: user.id,
    organizationId: user.organizationId,
    action,
    targetType: "session",
    targetId: refresh.session.id,
    severity: "info"
  });

  const store = req.app.locals.store;
  const { appVersion, buildNumber, platform } = req.body || {};
  const deviceModel = req.headers["x-device-model"] || "";
  const updateInfo = appVersion ? getAppUpdateInfo(store, appVersion) : {};

  if (appVersion && store?.recordDeviceVersion) {
    store.recordDeviceVersion(user.id, { version: appVersion, buildNumber, platform, deviceModel });
  }

  return res.status(statusCode).json({
    ok: true,
    token: session.token,
    tokenExpiresAt: session.tokenExpiresAt,
    refreshToken: refresh.refreshToken,
    refreshTokenExpiresAt: refresh.session.expiresAt,
    session: refresh.session,
    user,
    ...buildAuthContextPayload(authContext),
    ...updateInfo,
    dashboard: authContext.canUseOperations
      ? await store.getDashboardOverview(user)
      : null
  });
}

router.post("/login", authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      ok: false,
      message: "Correo y contrasena son obligatorios"
    });
  }

  const user = await req.app.locals.store.authenticate(email, password);

  if (!user) {
    await recordAuditLog(req, {
      action: "auth.failed_login",
      severity: "warning",
      targetType: "user",
      metadata: {
        email: String(email || "").trim().toLowerCase()
      }
    });

    return res.status(401).json({
      ok: false,
      message: "Credenciales invalidas"
    });
  }

  return buildLoginResponse(req, res, user, 200, "auth.login");
});

router.post("/register", authLimiter, async (req, res, next) => {
  const { name, email, password, phone, companyName, accountType } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      ok: false,
      message: "Nombre, correo y contrasena son obligatorios"
    });
  }

  try {
    const user = await req.app.locals.store.registerUser({
      name,
      email,
      password,
      phone,
      companyName,
      accountType
    });

    if (communication.isConfigured()) {
      const delivery = await communication.sendEmail({
        to: user.email,
        template: "welcome",
        data: {
          name: user.name,
          dashboardUrl: APP_URL,
          userId: user.id,
          organizationId: user.organizationId
        }
      }).catch((error) => ({ success: false, error: error?.message || String(error), provider: "resend" }));

      if (delivery?.success === false) {
        logger.error({
          action: "WelcomeEmail",
          module: "Auth",
          message: "No fue posible confirmar el correo de bienvenida",
          metadata: {
            email: user.email,
            error: delivery.error,
            provider: delivery.provider || "resend",
            template: "welcome"
          }
        });
      }
    }

    return buildLoginResponse(req, res, user, 201, "auth.register");
  } catch (error) {
    error.statusCode = error.message === "El correo ya existe" ? 409 : 400;
    error.publicMessage = "No fue posible registrar la cuenta";
    return next(error);
  }
});

router.post("/refresh", refreshLimiter, async (req, res) => {
  const refreshToken = String(req.body?.refreshToken || "").trim();

  if (!refreshToken) {
    return res.status(400).json({
      ok: false,
      message: "refreshToken es obligatorio"
    });
  }

  const rotated = await rotateRefreshToken(refreshToken, req);

  if (!rotated) {
    await recordAuditLog(req, {
      action: "auth.refresh_rejected",
      severity: "warning",
      targetType: "session"
    });

    return res.status(401).json({
      ok: false,
      message: "Sesion expirada o revocada"
    });
  }

  const user = await req.app.locals.store.getUserById(rotated.session.userId);

  if (!user || String(user.userStatus || "active").toLowerCase() === "suspended") {
    await revokeRefreshToken(rotated.refreshToken, "user_not_found");
    return res.status(401).json({
      ok: false,
      message: "Sesion invalida"
    });
  }

  const session = buildAuthSession(user, rotated.session.id);
  const authContext = await buildAuthContext(req.app.locals.store, user);
  await recordAuditLog(req, {
    actorId: user.id,
    organizationId: user.organizationId,
    action: "auth.refresh",
    targetType: "session",
    targetId: rotated.session.id,
    severity: "info"
  });

  const refreshStore = req.app.locals.store;
  const { appVersion } = req.body || {};
  const refreshUpdateInfo = appVersion ? getAppUpdateInfo(refreshStore, appVersion) : {};

  return res.json({
    ok: true,
    token: session.token,
    tokenExpiresAt: session.tokenExpiresAt,
    refreshToken: rotated.refreshToken,
    refreshTokenExpiresAt: rotated.session.expiresAt,
    session: rotated.session,
    user,
    ...buildAuthContextPayload(authContext),
    ...refreshUpdateInfo
  });
});

router.post("/forgot-password", authLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      ok: false,
      message: "El correo es obligatorio"
    });
  }

  try {
    const result = await req.app.locals.store.generatePasswordResetToken(email);

    if (!result) {
      return res.json({
        ok: true,
        message: "Si el correo existe, recibiras instrucciones para recuperar tu contrasena"
      });
    }

    const resetUrl = `${APP_URL.replace(/\/$/, "")}/reset-password?token=${result.token}`;

    if (communication.isConfigured()) {
      try {
        const delivery = await communication.sendEmail({
          to: result.email,
          template: "password-reset",
          data: {
            name: result.name,
            resetUrl,
            userId: result.userId,
            organizationId: result.organizationId
          }
        });

        if (delivery?.success !== true) {
          logger.error({
            action: "ForgotPasswordEmail",
            module: "Auth",
            message: "El proveedor no confirmó el correo de recuperación",
            metadata: {
              email: result.email,
              error: delivery?.error || "Resultado sin confirmación",
              provider: delivery?.provider || "resend",
              status: delivery?.queued ? "pending" : "failed",
              template: "password-reset"
            }
          });
          await req.app.locals.store.recordAppEvent?.({
            type: "email_delivery_failed",
            scope: "communication",
            level: "warning",
            status: delivery?.queued ? "pending" : "failed",
            userId: result.userId,
            organizationId: result.organizationId,
            message: "Correo de recuperación no confirmado por el proveedor",
            metadata: {
              error: delivery?.error || null,
              provider: delivery?.provider || "resend",
              template: "password-reset"
            }
          });
        }
      } catch (error) {
        logger.error({
          action: "ForgotPasswordEmail",
          module: "Auth",
          message: "Error enviando correo de recuperación",
          error,
          metadata: { email: result.email }
        });
        await req.app.locals.store.recordAppEvent?.({
          type: "email_delivery_failed",
          scope: "communication",
          level: "warning",
          status: "failed",
          userId: result.userId,
          organizationId: result.organizationId,
          message: "Falló el correo de recuperación",
          metadata: {
            error: error?.message || String(error),
            provider: "resend",
            template: "password-reset"
          }
        });
      }
    } else if (RESEND_API_KEY && RESEND_FROM_EMAIL) {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: RESEND_FROM_EMAIL,
          to: [result.email],
          subject: "Recuperacion de contrasena - ManeComb",
          html: [
            `<p>Hola ${result.name},</p>`,
            `<p>Recibimos una solicitud para restablecer tu contrasena de ManeComb.</p>`,
            `<p>Haz clic en el siguiente enlace para crear una nueva contrasena:</p>`,
            `<p><a href="${resetUrl}">${resetUrl}</a></p>`,
            `<p>Este enlace expira en 1 hora.</p>`,
            `<p><strong>Importante:</strong> si usas un dispositivo nuevo, el cambio de contrasena puede impedir recuperar mensajes cifrados anteriores. Conserva acceso a un dispositivo donde ya hayas iniciado sesion para volver a respaldar tu clave privada.</p>`,
            `<p>Si no solicitaste este cambio, ignora este mensaje.</p>`
          ].join("\n")
        })
      });

      if (!emailResponse.ok) {
        const providerMessage = await emailResponse.text().catch(() => "");
        throw new Error(`Resend error ${emailResponse.status}: ${providerMessage.slice(0, 300)}`);
      }
    }

    await recordAuditLog(req, {
      action: "auth.forgot_password",
      severity: "info",
      targetType: "user",
      metadata: { email }
    });

    return res.json({
      ok: true,
      message: "Si el correo existe, recibiras instrucciones para recuperar tu contrasena"
    });
  } catch (error) {
    logger.error({ action: "forgotPassword", error: error.message });
    return res.status(500).json({
      ok: false,
      message: "No fue posible procesar la solicitud"
    });
  }
});

router.post("/reset-password", authLimiter, async (req, res, next) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({
      ok: false,
      message: "Token y nueva contrasena son obligatorios"
    });
  }

  try {
    const user = await req.app.locals.store.resetPasswordWithToken(token, password);
    await revokeAllSessions(user.id, null, "password_reset");

    await recordAuditLog(req, {
      action: "auth.reset_password",
      severity: "info",
      targetType: "user",
      targetId: user.id
    });

    return res.json({
      ok: true,
      message: "Contrasena actualizada correctamente. En un dispositivo nuevo, tus mensajes cifrados anteriores pueden requerir que vuelvas a respaldar la clave desde un dispositivo donde ya tenias sesion."
    });
  } catch (error) {
    const status = error.message.includes("expirado") || error.message.includes("invalido") ? 400 : 500;
    error.statusCode = status;
    error.publicMessage = "No fue posible restablecer la contrasena";
    return next(error);
  }
});

router.post("/logout", async (req, res) => {
  const refreshToken = String(req.body?.refreshToken || "").trim();
  const session = refreshToken ? await revokeRefreshToken(refreshToken, "logout") : null;

  try {
    await recordAuditLog(req, {
      actorId: session?.userId || null,
      organizationId: session?.organizationId || "",
      action: "auth.logout",
      targetType: "session",
      targetId: session?.id || null,
      severity: "info"
    });
  } catch (auditError) {
    logger.warn({ action: "logout.audit_failed", error: auditError.message });
  }

  return res.json({
    ok: true
  });
});

router.post("/logout-all", authenticate, async (req, res) => {
  const keepCurrent = req.body?.keepCurrent === true;
  const revokedCount = await revokeAllSessions(
    req.user.id,
    keepCurrent ? req.auth?.sid : null,
    "logout_all"
  );

  await recordAuditLog(req, {
    action: "auth.logout_all",
    targetType: "session",
    severity: "warning",
    metadata: {
      revokedCount,
      keepCurrent
    }
  });

  return res.json({
    ok: true,
    data: {
      revokedCount
    }
  });
});

async function sendSessionResponse(req, res) {
  const store = req.app.locals.store;
  const authContext = await buildAuthContext(store, req.user);
  logAuthAccessDecision(req.path === "/session" ? "auth.session" : "auth.me", req.user, authContext);

  const { appVersion } = req.query || {};
  const updateInfo = appVersion ? getAppUpdateInfo(store, appVersion) : {};

  return res.json({
    ok: true,
    profile: await store.getUserProfile(req.user.id),
    ...buildAuthContextPayload(authContext),
    ...updateInfo,
    dashboard: authContext.canUseOperations
      ? await store.getDashboardOverview(req.user)
      : null
  });
}

router.get("/session", authenticate, sendSessionResponse);
router.get("/me", authenticate, sendSessionResponse);

router.get("/e2ee-backup", authenticate, async (req, res) => {
  const backup = await req.app.locals.store.getUserE2eeBackup?.(
    req.user.id,
    req.query.deviceId
  );

  return res.json({
    ok: true,
    data: backup
  });
});

router.put("/e2ee-backup", authenticate, async (req, res, next) => {
  try {
    const backup = await req.app.locals.store.upsertUserE2eeBackup?.(req.user.id, req.body || {});

    return res.json({
      ok: true,
      data: backup
    });
  } catch (error) {
    error.statusCode = 400;
    error.publicMessage = "No fue posible sincronizar el respaldo E2EE";
    return next(error);
  }
});

module.exports = router;
