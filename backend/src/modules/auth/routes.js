const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const { enterpriseRateLimit } = require("../../middlewares/enterprise-rate-limit");
const { buildAuthContext } = require("../../services/auth-context");
const { recordAuditLog } = require("../../services/audit");
const { sanitizeProfileForViewer } = require("../../services/profile-visibility");
const {
  createSessionForRequest,
  revokeAllSessions,
  revokeRefreshToken,
  rotateRefreshToken
} = require("../../services/sessions");
const { buildAuthSession } = require("../../utils/jwt");
const { APP_URL, PASSWORD_RESET_PUBLIC_URL } = require("../../config/env");
const communication = require("../../../modules/communication");
const logger = require("../../services/logger");
const { sendSecurityChangeEmail } = require("../../services/domain-email-events");
const {
  createDeliveryResult,
  isDeliveryFailed
} = communication.deliveryResults;

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

async function getAppUpdateInfo(store, currentVersion) {
  try {
    const appConfig = store?.getAppConfig
      ? await Promise.resolve(store.getAppConfig())
      : null;
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

async function recordDeviceVersionBestEffort(store, userId, versionInfo) {
  if (!store?.recordDeviceVersion) return;

  try {
    await Promise.resolve(store.recordDeviceVersion(userId, versionInfo));
  } catch (error) {
    logger.warn({
      action: "RecordAppClientVersion",
      module: "Auth",
      userId,
      status: "degraded",
      message: "No fue posible persistir telemetria de version del cliente",
      metadata: {
        error: communication.security.sanitizeProviderError(error)
      }
    });
  }
}

const router = Router();
const authLimiter = enterpriseRateLimit({ scope: "auth", max: 20, windowMs: 60 * 1000 });
const refreshLimiter = enterpriseRateLimit({ scope: "auth-refresh", max: 30, windowMs: 60 * 1000 });
const passwordResetLimiter = enterpriseRateLimit({
  scope: "auth-password-reset",
  max: 5,
  windowMs: 15 * 60 * 1000,
  message: "Demasiadas solicitudes de recuperacion. Intenta de nuevo mas tarde."
});
const PASSWORD_RECOVERY_ACCEPTED_MESSAGE =
  "Solicitud recibida. Revisa tu correo para continuar con la recuperacion.";
const REGISTRATION_PASSWORD_ERRORS = new Set([
  "La contraseña debe tener al menos 8 caracteres",
  "La contraseña debe incluir letras, números y al menos un carácter especial"
]);

function getRegistrationPublicError(error) {
  const message = String(error?.message || "").trim();

  if (message === "El correo ya existe") {
    return {
      statusCode: 409,
      publicMessage: "Este correo ya esta registrado. Inicia sesion o recupera tu contrasena."
    };
  }

  if (REGISTRATION_PASSWORD_ERRORS.has(message)) {
    return {
      statusCode: 400,
      publicMessage: message
    };
  }

  if (/Nombre, correo y contrase(?:n|ñ)a son obligatorios/i.test(message)) {
    return {
      statusCode: 400,
      publicMessage: "Nombre, correo y contrasena son obligatorios"
    };
  }

  return {
    statusCode: 400,
    publicMessage: "No fue posible registrar la cuenta"
  };
}

async function sendWelcomeEmailBestEffort(user) {
  try {
    const delivery = await communication.sendEmail({
      recipient: { email: user.email, name: user.name },
      template: "welcome",
      eventType: "WELCOME",
      tenantScope: user.organizationId ? `organization:${user.organizationId}` : `user:${user.id}`,
      organizationId: user.organizationId || undefined,
      idempotencyKey: `welcome:${user.id}`,
      data: {
        name: user.name,
        dashboardUrl: APP_URL,
        userId: user.id,
        organizationId: user.organizationId
      }
    });

    if (isDeliveryFailed(delivery)) {
      logger.error({
        action: "WelcomeEmail",
        module: "Auth",
        message: "No fue posible confirmar el correo de bienvenida",
        metadata: {
          recipient: communication.security.maskEmail(user.email),
          error: delivery.error,
          provider: communication.getProviderName(),
          template: "welcome"
        }
      });
    }
  } catch (error) {
    logger.error({
      action: "WelcomeEmail",
      module: "Auth",
      message: "Error enviando correo de bienvenida",
      metadata: {
        recipient: communication.security.maskEmail(user?.email),
        error: communication.security.sanitizeProviderError(error),
        provider: communication.getProviderName(),
        template: "welcome"
      }
    });
  }
}

async function rollbackCreatedRegistration(req, user, cause) {
  if (!user?.id) {
    return;
  }

  const store = req.app.locals.store;
  let revokedCount = 0;
  let userDeleted = false;
  let sessionRollbackError = null;
  let userRollbackError = null;

  try {
    revokedCount = await revokeAllSessions(user.id, null, "registration_rollback");
  } catch (error) {
    sessionRollbackError = communication.security.sanitizeProviderError(error);
  }

  try {
    userDeleted = Boolean(await store.deleteUser?.(user.id));
  } catch (error) {
    userRollbackError = communication.security.sanitizeProviderError(error);
  }

  const rollbackComplete = userDeleted && !sessionRollbackError && !userRollbackError;
  const logPayload = {
    action: "RegistrationRollback",
    module: "Auth",
    organizationId: user.organizationId,
    userId: user.id,
    status: rollbackComplete ? "rolled_back" : "partial",
    message: rollbackComplete
      ? "Registro incompleto revertido; la cuenta puede intentarse nuevamente"
      : "El rollback de un registro incompleto no pudo completarse",
    metadata: {
      cause: communication.security.sanitizeProviderError(cause),
      revokedCount,
      sessionRollbackError,
      userDeleted,
      userRollbackError
    }
  };

  if (rollbackComplete) {
    logger.warn(logPayload);
  } else {
    logger.error(logPayload);
  }
}

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
      accountChannel: authContext?.accountChannel || null,
      accountChannelReason: authContext?.accountChannelReason || null,
      canAccessMobile: authContext?.canAccessMobile ?? null,
      canAccessPortal: authContext?.canAccessPortal ?? null,
      canUseOperations: authContext?.canUseOperations ?? null,
      email: user?.email || null,
      mobileBlockReason: authContext?.mobileBlockReason || null,
      operationalBlockReason: authContext?.operationalBlockReason || null,
      productRoute: authContext?.productRoute || authContext?.route || null,
      source,
      subscriptionIsActive: authContext?.subscription?.isActive ?? null,
      subscriptionStatus: authContext?.subscription?.status || null,
      tenantStatus: authContext?.tenant?.status || null
    },
    module: "Auth",
    organizationId: user?.organizationId,
    status: authContext?.accountChannel === "blocked" ? "blocked" : "resolved",
    userId: user?.id
  });
}

function buildAuthContextPayload(authContext) {
  return {
    authContext,
    accountChannel: authContext.accountChannel,
    accountChannelReason: authContext.accountChannelReason,
    canAccessMobile: authContext.canAccessMobile,
    canAccessPortal: authContext.canAccessPortal,
    canUseOperations: authContext.canUseOperations,
    mobileBlockReason: authContext.mobileBlockReason,
    operationalBlockReason: authContext.operationalBlockReason,
    tenant: authContext.tenant,
    subscription: authContext.subscription,
    onboarding: authContext.onboarding,
    postLoginDestination: authContext.productDestination || authContext.destination,
    postLoginRoute: authContext.productRoute || authContext.route,
    productDestination: authContext.productDestination || authContext.destination,
    productRoute: authContext.productRoute || authContext.route
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
  const updateInfo = appVersion ? await getAppUpdateInfo(store, appVersion) : {};

  if (appVersion) {
    await recordDeviceVersionBestEffort(store, user.id, {
      version: appVersion,
      buildNumber,
      platform,
      deviceModel
    });
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

  let createdUser = null;

  try {
    createdUser = await req.app.locals.store.registerUser({
      name,
      email,
      password,
      phone,
      companyName,
      accountType
    });

    const response = await buildLoginResponse(req, res, createdUser, 201, "auth.register");
    void sendWelcomeEmailBestEffort(createdUser);
    return response;
  } catch (error) {
    if (createdUser?.id && !res.headersSent) {
      await rollbackCreatedRegistration(req, createdUser, error);
    }

    const registrationError = getRegistrationPublicError(error);
    error.statusCode = registrationError.statusCode;
    error.publicMessage = registrationError.publicMessage;
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

  if (!user) {
    await revokeRefreshToken(rotated.refreshToken, "user_not_found");
    return res.status(401).json({
      ok: false,
      message: "Sesion invalida"
    });
  }

  if (String(user.userStatus || "active").toLowerCase() === "suspended") {
    await revokeRefreshToken(rotated.refreshToken, "account_suspended");
    return res.status(401).json({
      ok: false,
      code: "ACCOUNT_SUSPENDED",
      message: "Tu acceso fue suspendido por el administrador de tu empresa"
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
  const refreshUpdateInfo = appVersion ? await getAppUpdateInfo(refreshStore, appVersion) : {};

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

router.post("/forgot-password", passwordResetLimiter, async (req, res) => {
  const { email } = req.body;
  const startedAt = Date.now();

  if (!email) {
    return res.status(400).json({
      ok: false,
      message: "El correo es obligatorio"
    });
  }

  try {
    const result = await req.app.locals.store.generatePasswordResetToken(email);

    await req.app.locals.store.recordAppEvent?.({
      type: "password_reset_requested",
      scope: "auth",
      level: "info",
      status: "accepted",
      userId: result?.userId,
      organizationId: result?.organizationId,
      message: "Solicitud neutral de recuperacion aceptada",
      metadata: { durationMs: Date.now() - startedAt }
    });

    if (!result) {
      return res.json({
        ok: true,
        message: PASSWORD_RECOVERY_ACCEPTED_MESSAGE
      });
    }

    const resetUrl = new URL(PASSWORD_RESET_PUBLIC_URL);
    resetUrl.searchParams.set("token", result.token);

    {
      try {
        const delivery = await communication.sendEmail({
          recipient: { email: result.email, name: result.name },
          template: "password-reset",
          eventType: "PASSWORD_RESET",
          tenantScope: result.organizationId ? `organization:${result.organizationId}` : `user:${result.userId}`,
          organizationId: result.organizationId || undefined,
          idempotencyKey: `password-reset:${result.requestId}`,
          data: {
            name: result.name,
            resetUrl: resetUrl.toString(),
            validity: "1 hora",
            userId: result.userId,
            organizationId: result.organizationId
          }
        });

        await req.app.locals.store.recordAppEvent?.({
          type: "password_reset_delivery_requested",
          scope: "communication",
          level: "info",
          status: delivery?.status || "unknown",
          userId: result.userId,
          organizationId: result.organizationId,
          message: "Entrega de recuperacion solicitada",
          metadata: {
            provider: communication.getProviderName(),
            requestId: result.requestId,
            status: delivery?.status || "unknown",
            template: "password-reset"
          }
        });

        if (isDeliveryFailed(delivery)) {
          logger.error({
            action: "ForgotPasswordEmail",
            module: "Auth",
            message: "Falló la entrega del correo de recuperación",
            metadata: {
              recipient: communication.security.maskEmail(result.email),
              error: delivery?.error || "email_delivery_failed",
              provider: communication.getProviderName(),
              status: "failed",
              template: "password-reset"
            }
          });
          await req.app.locals.store.recordAppEvent?.({
            type: "password_reset_delivery_failed",
            scope: "communication",
            level: "warning",
            status: "failed",
            userId: result.userId,
            organizationId: result.organizationId,
            message: "Falló la entrega del correo de recuperación",
            metadata: {
              error: delivery?.error || null,
              provider: communication.getProviderName(),
              template: "password-reset"
            }
          });
        }
      } catch (error) {
        logger.error({
          action: "ForgotPasswordEmail",
          module: "Auth",
          message: "Error enviando correo de recuperación",
          metadata: {
            recipient: communication.security.maskEmail(result.email),
            error: communication.security.sanitizeProviderError(error)
          }
        });
        await req.app.locals.store.recordAppEvent?.({
          type: "password_reset_delivery_failed",
          scope: "communication",
          level: "warning",
          status: "failed",
          userId: result.userId,
          organizationId: result.organizationId,
          message: "Falló el correo de recuperación",
          metadata: {
            error: communication.security.sanitizeProviderError(error),
            provider: communication.getProviderName(),
            template: "password-reset"
          }
        });
      }
    }

    await recordAuditLog(req, {
      action: "auth.forgot_password",
      severity: "info",
      targetType: "user",
      metadata: { email: communication.security.maskEmail(email) }
    });

    return res.json({
      ok: true,
      message: PASSWORD_RECOVERY_ACCEPTED_MESSAGE
    });
  } catch (error) {
    logger.error({ action: "forgotPassword", message: communication.security.sanitizeProviderError(error) });
    return res.json({
      ok: true,
      message: PASSWORD_RECOVERY_ACCEPTED_MESSAGE
    });
  }
});

router.post("/reset-password", authLimiter, async (req, res, next) => {
  const { token, password } = req.body;
  const startedAt = Date.now();

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
    await sendSecurityChangeEmail(user, "PASSWORD_CHANGED");

    await req.app.locals.store.recordAppEvent?.({
      type: "password_reset_completed",
      scope: "auth",
      level: "info",
      status: "completed",
      userId: user.id,
      organizationId: user.organizationId,
      message: "Contrasena restablecida",
      metadata: { durationMs: Date.now() - startedAt }
    });

    return res.json({
      ok: true,
      message: "Contrasena actualizada correctamente. En un dispositivo nuevo, tus mensajes cifrados anteriores pueden requerir que vuelvas a respaldar la clave desde un dispositivo donde ya tenias sesion."
    });
  } catch (error) {
    const isRejectedInput = /expirado|invalido|contrase(?:n|ñ)a/i.test(error.message);
    const status = isRejectedInput ? 400 : 500;
    await req.app.locals.store.recordAppEvent?.({
      type: "password_reset_rejected",
      scope: "auth",
      level: "warning",
      status: "rejected",
      message: "Restablecimiento rechazado",
      metadata: {
        error: communication.security.sanitizeProviderError(error),
        durationMs: Date.now() - startedAt
      }
    });
    error.statusCode = status;
    error.publicMessage = status === 400
      ? error.message
      : "No fue posible restablecer la contrasena";
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
  const updateInfo = appVersion ? await getAppUpdateInfo(store, appVersion) : {};
  const profile = sanitizeProfileForViewer(
    req.user,
    await store.getUserProfile(req.user.id)
  );

  return res.json({
    ok: true,
    profile,
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
