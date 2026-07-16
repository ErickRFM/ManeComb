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
const logger = require("../../services/logger");

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

  return res.status(statusCode).json({
    ok: true,
    token: session.token,
    tokenExpiresAt: session.tokenExpiresAt,
    refreshToken: refresh.refreshToken,
    refreshTokenExpiresAt: refresh.session.expiresAt,
    session: refresh.session,
    user,
    ...buildAuthContextPayload(authContext),
    dashboard: authContext.canUseOperations
      ? await req.app.locals.store.getDashboardOverview(user)
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

router.post("/register", authLimiter, async (req, res) => {
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

    return buildLoginResponse(req, res, user, 201, "auth.register");
  } catch (error) {
    return res.status(error.message === "El correo ya existe" ? 409 : 400).json({
      ok: false,
      message: error.message || "No fue posible registrar la cuenta"
    });
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

  return res.json({
    ok: true,
    token: session.token,
    tokenExpiresAt: session.tokenExpiresAt,
    refreshToken: rotated.refreshToken,
    refreshTokenExpiresAt: rotated.session.expiresAt,
    session: rotated.session,
    user,
    ...buildAuthContextPayload(authContext)
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

    if (RESEND_API_KEY && RESEND_FROM_EMAIL) {
      await fetch("https://api.resend.com/emails", {
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
            `<p>Si no solicitaste este cambio, ignora este mensaje.</p>`
          ].join("\n")
        })
      });
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

router.post("/reset-password", authLimiter, async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({
      ok: false,
      message: "Token y nueva contrasena son obligatorios"
    });
  }

  try {
    await req.app.locals.store.resetPasswordWithToken(token, password);

    await recordAuditLog(req, {
      action: "auth.reset_password",
      severity: "info",
      targetType: "user"
    });

    return res.json({
      ok: true,
      message: "Contrasena actualizada correctamente"
    });
  } catch (error) {
    const status = error.message.includes("expirado") || error.message.includes("invalido") ? 400 : 500;
    return res.status(status).json({
      ok: false,
      message: error.message || "No fue posible restablecer la contrasena"
    });
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
  const authContext = await buildAuthContext(req.app.locals.store, req.user);
  logAuthAccessDecision(req.path === "/session" ? "auth.session" : "auth.me", req.user, authContext);

  return res.json({
    ok: true,
    profile: await req.app.locals.store.getUserProfile(req.user.id),
    ...buildAuthContextPayload(authContext),
    dashboard: authContext.canUseOperations
      ? await req.app.locals.store.getDashboardOverview(req.user)
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

router.put("/e2ee-backup", authenticate, async (req, res) => {
  try {
    const backup = await req.app.locals.store.upsertUserE2eeBackup?.(req.user.id, req.body || {});

    return res.json({
      ok: true,
      data: backup
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      message: error.message || "No fue posible sincronizar el respaldo E2EE"
    });
  }
});

module.exports = router;
