const { randomBytes } = require("crypto");
const crypto = require("crypto");
const { verifyPlatformChallengeToken, signPlatformToken } = require("../../utils/platform-jwt");
const { isMfaEncryptionKeyValid, encrypt, decrypt } = require("../../utils/platform-mfa-crypto");
const { generateBase32Secret, verifyTOTP, generateTOTPUri } = require("../../utils/platform-totp");
const { recordPlatformAction } = require("../../services/platform-audit");
const { getPlatformSessionById, markPlatformSessionMfaVerified } = require("../../services/platform-sessions");
const { hasPlatformPermission } = require("../../config/platform-roles");
const { sanitizePlatformUser } = require("../../middlewares/platform-auth");

const MFA_RATE_LIMIT_MAX = 5;
const MFA_RATE_LIMIT_WINDOW_MS = 30 * 60 * 1000;
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_BYTES = 10;

function isMfaOperational() {
  return isMfaEncryptionKeyValid();
}

function isMfaRequired(role) {
  if (!role) return false;
  return true;
}

function getStore(req) {
  return req.app.locals.store;
}

async function getPlatformUser(userId, req) {
  return getStore(req).getPlatformUserById(userId);
}

async function updatePlatformUser(userId, updates, req) {
  return getStore(req).updatePlatformUser(userId, updates);
}

async function checkMfaRateLimit(userId, req) {
  const user = await getPlatformUser(userId, req);
  if (!user) return null;
  if (user.mfaLockedUntil && new Date(user.mfaLockedUntil).getTime() > Date.now()) {
    return { error: "Demasiados intentos MFA. Intenta de nuevo más tarde.", status: 429 };
  }
  return null;
}

async function incrementMfaFailedAttempts(userId, req) {
  const user = await getPlatformUser(userId, req);
  if (!user) return;
  const attempts = (user.mfaFailedAttempts || 0) + 1;
  const update = { mfaFailedAttempts: attempts };
  if (attempts >= MFA_RATE_LIMIT_MAX) {
    update.mfaLockedUntil = new Date(Date.now() + MFA_RATE_LIMIT_WINDOW_MS);
  }
  await updatePlatformUser(user._id, update, req);
}

function generateBackupCodes() {
  const codes = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = randomBytes(BACKUP_CODE_BYTES).toString("base64url");
    codes.push(code);
  }
  return codes;
}

function hashBackupCode(code) {
  return crypto.createHash("sha256").update(String(code || "")).digest("hex");
}

async function mfaSetup(userId, req) {
  if (!isMfaOperational()) {
    return { error: "MFA no disponible", status: 503 };
  }

  const user = await getPlatformUser(userId, req);
  if (!user) {
    return { error: "Usuario no encontrado", status: 404 };
  }

  if (user.mfaEnabled) {
    return { error: "MFA ya está habilitado", status: 409 };
  }

  const secret = generateBase32Secret();
  const encryptedSecret = encrypt(secret);
  const uri = generateTOTPUri(secret, user.email);

  await updatePlatformUser(user._id, {
    mfaSecretEncrypted: encryptedSecret,
    mfaFailedAttempts: 0,
    mfaLockedUntil: null
  }, req);

  await recordPlatformAction(req, {
    action: "platform.mfa.setup_initiated",
    actorId: user._id,
    platformRole: user.role,
    severity: "info",
    metadata: { result: "success" }
  });

  return { secret, uri };
}

async function mfaConfirm(userId, token, req) {
  if (!isMfaOperational()) {
    return { error: "MFA no disponible", status: 503 };
  }

  const rateCheck = await checkMfaRateLimit(userId, req);
  if (rateCheck) return rateCheck;

  const user = await getPlatformUser(userId, req);
  if (!user) {
    return { error: "Usuario no encontrado", status: 404 };
  }

  if (user.mfaEnabled) {
    return { error: "MFA ya está habilitado", status: 409 };
  }

  if (!user.mfaSecretEncrypted) {
    return { error: "Debes iniciar setup primero", status: 400 };
  }

  let decryptedSecret;
  try {
    decryptedSecret = decrypt(user.mfaSecretEncrypted);
  } catch {
    return { error: "Error interno de configuración MFA", status: 500 };
  }

  if (!verifyTOTP(String(token).trim(), decryptedSecret, Date.now())) {
    await incrementMfaFailedAttempts(userId, req);
    await recordPlatformAction(req, {
      action: "platform.mfa.confirm_failed",
      actorId: user._id,
      platformRole: user.role,
      severity: "warning",
      metadata: { result: "failed", reasonCode: "invalid_token" }
    });
    return { error: "Código inválido", status: 401 };
  }

  const backupCodes = generateBackupCodes();
  const hashedCodes = backupCodes.map((code) => hashBackupCode(code));

  await updatePlatformUser(user._id, {
    mfaEnabled: true,
    mfaEnrollmentRequired: false,
    mfaBackupCodes: hashedCodes,
    mfaSetupCompletedAt: new Date(),
    mfaFailedAttempts: 0,
    mfaLockedUntil: null
  }, req);

  await recordPlatformAction(req, {
    action: "platform.mfa.confirmed",
    actorId: user._id,
    platformRole: user.role,
    severity: "info",
    metadata: { result: "success" }
  });

  return { backupCodes };
}

async function mfaVerify(req) {
  if (!isMfaOperational()) {
    return { error: "MFA no disponible", status: 503 };
  }

  const { challengeToken, token } = req.body;
  if (!challengeToken || !token) {
    return { error: "Challenge token y código MFA requeridos", status: 400 };
  }

  let payload;
  try {
    payload = verifyPlatformChallengeToken(challengeToken);
  } catch {
    return { error: "Challenge token inválido o expirado", status: 401 };
  }

  if (payload.tokenType !== "platform_mfa_challenge") {
    return { error: "Challenge token inválido", status: 401 };
  }

  if (payload.purpose !== "mfa_verify") {
    return { error: "Challenge token inválido para verificación", status: 401 };
  }

  const userId = payload.sub;
  const sessionId = payload.sid;

  const rateCheck = await checkMfaRateLimit(userId, req);
  if (rateCheck) return rateCheck;

  const user = await getPlatformUser(userId, req);
  if (!user || user.status !== "active") {
    return { error: "Cuenta no activa", status: 401 };
  }

  if (!user.mfaEnabled || !user.mfaSecretEncrypted) {
    return { error: "MFA no está habilitado", status: 403 };
  }

  let decryptedSecret;
  try {
    decryptedSecret = decrypt(user.mfaSecretEncrypted);
  } catch {
    return { error: "Error interno de verificación MFA", status: 500 };
  }

  if (verifyTOTP(String(token).trim(), decryptedSecret, Date.now())) {
    await updatePlatformUser(user._id, {
      mfaFailedAttempts: 0,
      mfaLockedUntil: null
    }, req);

    await markPlatformSessionMfaVerified(sessionId);

    const platformToken = signPlatformToken(user, sessionId);
    const session = await getPlatformSessionById(sessionId);

    await recordPlatformAction(req, {
      action: "platform.mfa.verified",
      actorId: user._id,
      platformRole: user.role,
      severity: "info",
      metadata: { result: "success", sessionId }
    });

    return {
      token: platformToken,
      session: {
        id: sessionId,
        expiresAt: session?.expiresAt || null
      },
      user: sanitizePlatformUser(user)
    };
  }

  await incrementMfaFailedAttempts(userId, req);
  await recordPlatformAction(req, {
    action: "platform.mfa.verify_failed",
    actorId: user._id,
    platformRole: user.role,
    severity: "warning",
    metadata: { result: "failed", reasonCode: "invalid_token" }
  });
  return { error: "Código inválido", status: 401 };
}

async function mfaRecovery(req) {
  if (!isMfaOperational()) {
    return { error: "MFA no disponible", status: 503 };
  }

  const { challengeToken, recoveryCode } = req.body;
  if (!challengeToken || !recoveryCode) {
    return { error: "Challenge token y código de recuperación requeridos", status: 400 };
  }

  let payload;
  try {
    payload = verifyPlatformChallengeToken(challengeToken);
  } catch {
    return { error: "Challenge token inválido o expirado", status: 401 };
  }

  if (payload.tokenType !== "platform_mfa_challenge") {
    return { error: "Challenge token inválido", status: 401 };
  }

  if (payload.purpose !== "mfa_verify") {
    return { error: "Challenge token inválido para verificación", status: 401 };
  }

  const userId = payload.sub;
  const sessionId = payload.sid;

  const user = await getPlatformUser(userId, req);
  if (!user || user.status !== "active") {
    return { error: "Cuenta no activa", status: 401 };
  }

  if (!user.mfaEnabled || !user.mfaBackupCodes || user.mfaBackupCodes.length === 0) {
    return { error: "No hay códigos de recuperación disponibles", status: 403 };
  }

  const hashedInput = hashBackupCode(String(recoveryCode).trim());
  const codeIndex = user.mfaBackupCodes.indexOf(hashedInput);
  if (codeIndex === -1) {
    return { error: "Código de recuperación inválido", status: 401 };
  }

  const updatedCodes = [...user.mfaBackupCodes];
  updatedCodes.splice(codeIndex, 1);
  await updatePlatformUser(user._id, {
    mfaBackupCodes: updatedCodes,
    mfaFailedAttempts: 0,
    mfaLockedUntil: null
  }, req);

  await markPlatformSessionMfaVerified(sessionId);

  const platformToken = signPlatformToken(user, sessionId);
  const session = await getPlatformSessionById(sessionId);

  await recordPlatformAction(req, {
    action: "platform.mfa.recovery_used",
    actorId: user._id,
    platformRole: user.role,
    severity: "warning",
    metadata: { result: "success", sessionId, remainingCodes: updatedCodes.length }
  });

  return {
    token: platformToken,
    session: {
      id: sessionId,
      expiresAt: session?.expiresAt || null
    },
    user: sanitizePlatformUser(user)
  };
}

module.exports = {
  isMfaOperational,
  isMfaRequired,
  mfaSetup,
  mfaConfirm,
  mfaVerify,
  mfaRecovery,
  MFA_RATE_LIMIT_MAX,
  MFA_RATE_LIMIT_WINDOW_MS,
  BACKUP_CODE_COUNT
};
