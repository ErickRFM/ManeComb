const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { platformAuth } = require("../../middlewares/platform-auth");
const platformAuthService = require("./platform-auth-service");
const communication = require("../../../modules/communication");

const PLATFORM_PASSWORD_RESET_PUBLIC_URL = "https://admin.manecomb.com/admin/reset-password";
const PASSWORD_RECOVERY_ACCEPTED_MESSAGE = "Solicitud recibida. Revisa tu correo y la carpeta de spam.";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiados intentos. Intenta de nuevo más tarde." }
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas solicitudes. Intenta de nuevo más tarde." }
});

const passwordRecoveryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas solicitudes. Intenta de nuevo más tarde." }
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiados intentos. Intenta de nuevo más tarde." }
});

const router = Router();

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ ok: false, message: "Correo y contraseña son obligatorios" });
    }

    const result = await platformAuthService.login(email, password, req);
    if (result.error) {
      return res.status(result.status).json({ ok: false, message: result.error });
    }

    return res.json({ ok: true, data: result });
  } catch (error) {
    return next(error);
  }
});

router.post("/forgot-password", passwordRecoveryLimiter, async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ ok: false, message: "El correo es obligatorio" });
    }

    const result = await platformAuthService.requestPasswordReset(email, req);
    if (result.error) {
      return res.status(result.status).json({ ok: false, message: result.error });
    }

    if (result.token && result.user) {
      const resetUrl = new URL(PLATFORM_PASSWORD_RESET_PUBLIC_URL);
      resetUrl.searchParams.set("token", result.token);

      try {
        await communication.sendEmail({
          recipient: { email: result.user.email, name: result.user.name },
          template: "password-reset",
          eventType: "PASSWORD_RESET",
          tenantScope: `platform:${result.user.id}`,
          idempotencyKey: `platform-password-reset:${result.requestId}`,
          data: {
            name: result.user.name,
            resetUrl: resetUrl.toString(),
            validity: "1 hora",
            userId: result.user.id,
            organizationId: null
          }
        });
      } catch {
        // Respuesta neutral: no exponer estado de cuenta ni del proveedor de correo.
      }
    }

    return res.json({
      ok: true,
      data: { message: PASSWORD_RECOVERY_ACCEPTED_MESSAGE }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/reset-password", passwordResetLimiter, async (req, res, next) => {
  try {
    const token = String(req.body?.token || "").trim();
    const password = String(req.body?.password || "");
    if (!token || !password) {
      return res.status(400).json({ ok: false, message: "Token y nueva contraseña son obligatorios" });
    }

    const result = await platformAuthService.resetPassword(token, password, req);
    if (result.error) {
      return res.status(result.status).json({ ok: false, message: result.error });
    }

    return res.json({ ok: true, data: result });
  } catch (error) {
    return next(error);
  }
});

router.post("/refresh", refreshLimiter, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ ok: false, message: "Refresh token requerido" });
    }

    const result = await platformAuthService.refresh(refreshToken, req);
    if (result.error) {
      return res.status(result.status).json({ ok: false, message: result.error });
    }

    return res.json({ ok: true, data: result });
  } catch (error) {
    return next(error);
  }
});

router.get("/session", platformAuth, async (req, res, next) => {
  try {
    const result = await platformAuthService.getSession(req);
    return res.json({ ok: true, data: result });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", platformAuth, async (req, res, next) => {
  try {
    const result = await platformAuthService.logout(req);
    return res.json({ ok: true, data: result });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout-all", platformAuth, async (req, res, next) => {
  try {
    const result = await platformAuthService.logoutAll(req);
    return res.json({ ok: true, data: result });
  } catch (error) {
    return next(error);
  }
});

const { platformMfaChallenge } = require("../../middlewares/platform-mfa-challenge");
const platformMfaService = require("./platform-mfa-service");

const mfaSetupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiadas solicitudes. Intenta de nuevo más tarde." }
});

const mfaVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Demasiados intentos. Intenta de nuevo más tarde." }
});

router.post("/mfa/setup", mfaSetupLimiter, platformMfaChallenge("mfa_enroll"), async (req, res, next) => {
  try {
    const result = await platformMfaService.mfaSetup(req.platformUser.id, req);
    if (result.error) {
      return res.status(result.status).json({ ok: false, message: result.error });
    }
    return res.json({ ok: true, data: { secret: result.secret, uri: result.uri } });
  } catch (error) {
    return next(error);
  }
});

router.post("/mfa/confirm", mfaSetupLimiter, platformMfaChallenge("mfa_enroll"), async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ ok: false, message: "Código MFA requerido" });
    }
    const result = await platformMfaService.mfaConfirm(req.platformUser.id, token, req);
    if (result.error) {
      return res.status(result.status).json({ ok: false, message: result.error });
    }
    return res.json({ ok: true, data: { backupCodes: result.backupCodes } });
  } catch (error) {
    return next(error);
  }
});

router.post("/mfa/verify", mfaVerifyLimiter, async (req, res, next) => {
  try {
    const result = await platformMfaService.mfaVerify(req);
    if (result.error) {
      return res.status(result.status).json({ ok: false, message: result.error });
    }
    return res.json({ ok: true, data: result });
  } catch (error) {
    return next(error);
  }
});

router.post("/mfa/recovery", mfaVerifyLimiter, async (req, res, next) => {
  try {
    const result = await platformMfaService.mfaRecovery(req);
    if (result.error) {
      return res.status(result.status).json({ ok: false, message: result.error });
    }
    return res.json({ ok: true, data: result });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
