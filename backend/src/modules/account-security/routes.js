const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");
const { enterpriseRateLimit } = require("../../middlewares/enterprise-rate-limit");
const { recordAuditLog } = require("../../services/audit");
const { sendSecurityChangeEmail } = require("../../services/domain-email-events");
const { revokeAllSessions } = require("../../services/sessions");
const { validatePasswordStrength } = require("../../utils/password-policy");

const router = Router();
const passwordChangeLimiter = enterpriseRateLimit({
  scope: "account-password-change",
  max: 5,
  windowMs: 15 * 60 * 1000,
  message: "Demasiados intentos de cambio de contraseña. Intenta de nuevo más tarde."
});
const sessionRevokeLimiter = enterpriseRateLimit({
  scope: "account-session-revoke-all",
  max: 10,
  windowMs: 15 * 60 * 1000
});

router.post("/change-password", passwordChangeLimiter, authenticate, async (req, res, next) => {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        ok: false,
        message: "Contraseña actual, nueva contraseña y confirmación son obligatorias"
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        ok: false,
        message: "La confirmación no coincide con la nueva contraseña"
      });
    }

    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) {
      return res.status(400).json({ ok: false, message: strengthError });
    }

    const authenticatedUser = await req.app.locals.store.authenticate(
      req.user.email,
      currentPassword
    );

    if (!authenticatedUser || authenticatedUser.id !== req.user.id) {
      await recordAuditLog(req, {
        action: "auth.password_change_failed",
        targetType: "user",
        targetId: req.user.id,
        severity: "warning",
        metadata: { reason: "invalid_current_password" }
      });
      return res.status(401).json({
        ok: false,
        message: "La contraseña actual no es correcta"
      });
    }

    const reusesCurrentPassword = await req.app.locals.store.authenticate(
      req.user.email,
      newPassword
    );
    if (reusesCurrentPassword?.id === req.user.id) {
      return res.status(409).json({
        ok: false,
        message: "La nueva contraseña debe ser diferente de la contraseña actual"
      });
    }

    const updatedUser = await req.app.locals.store.updateUser(req.user.id, {
      password: newPassword
    });
    if (!updatedUser) {
      return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
    }

    const revokedSessions = await revokeAllSessions(
      req.user.id,
      req.auth?.sid || null,
      "password_changed"
    );

    await recordAuditLog(req, {
      action: "auth.password_changed",
      targetType: "user",
      targetId: req.user.id,
      severity: "warning",
      metadata: { revokedSessions }
    });
    await sendSecurityChangeEmail(updatedUser, "PASSWORD_CHANGED");

    return res.json({
      ok: true,
      data: { revokedSessions },
      message: revokedSessions
        ? `Contraseña actualizada. Se cerraron ${revokedSessions} sesiones adicionales.`
        : "Contraseña actualizada. Tu sesión actual continúa activa."
    });
  } catch (error) {
    error.statusCode = error.statusCode || 400;
    error.publicMessage = "No fue posible cambiar la contraseña";
    return next(error);
  }
});

router.delete("/sessions/others", sessionRevokeLimiter, authenticate, async (req, res, next) => {
  try {
    const revokedSessions = await revokeAllSessions(
      req.user.id,
      req.auth?.sid || null,
      "user_revoked_other_sessions"
    );

    await recordAuditLog(req, {
      action: "auth.revoke_other_sessions",
      targetType: "session",
      targetId: req.auth?.sid || req.user.id,
      severity: "warning",
      metadata: { revokedSessions }
    });

    return res.json({
      ok: true,
      data: { revokedSessions },
      message: revokedSessions
        ? `Se cerraron ${revokedSessions} sesiones adicionales.`
        : "No había otras sesiones activas."
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
