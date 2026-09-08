const jwt = require("jsonwebtoken");
const { PLATFORM_JWT_SECRET, PLATFORM_ACCESS_TOKEN_TTL, PLATFORM_MFA_CHALLENGE_TTL } = require("../config/env");

const PLATFORM_AUDIENCE = "manecomb-platform-admin";
const PLATFORM_MFA_AUDIENCE = "manecomb-platform-mfa";
const PLATFORM_PASSWORD_RESET_AUDIENCE = "manecomb-platform-password-reset";
const PLATFORM_ISSUER = "manecomb-api";
const PLATFORM_PASSWORD_RESET_TTL = "1h";

function isPlatformSecretValid() {
  return PLATFORM_JWT_SECRET && PLATFORM_JWT_SECRET.length >= 32;
}

class PlatformAuthNotConfigured extends Error {
  constructor() {
    super("PLATFORM_JWT_SECRET no está configurado o es inválido");
    this.name = "PlatformAuthNotConfigured";
    this.statusCode = 503;
    this.platformUnavailable = true;
  }
}

function signPlatformToken(user, sessionId) {
  if (!isPlatformSecretValid()) throw new PlatformAuthNotConfigured();
  return jwt.sign(
    {
      tokenType: "platform",
      role: user.role,
      sid: sessionId
    },
    PLATFORM_JWT_SECRET,
    {
      expiresIn: PLATFORM_ACCESS_TOKEN_TTL,
      subject: user.id || user._id,
      audience: PLATFORM_AUDIENCE,
      issuer: PLATFORM_ISSUER
    }
  );
}

function verifyPlatformToken(token) {
  if (!isPlatformSecretValid()) throw new PlatformAuthNotConfigured();
  return jwt.verify(token, PLATFORM_JWT_SECRET, {
    audience: PLATFORM_AUDIENCE,
    issuer: PLATFORM_ISSUER
  });
}

function getPlatformTokenExpiration(token) {
  const decoded = jwt.decode(token);
  const exp = Number(decoded?.exp || 0);
  if (!exp) return null;
  return new Date(exp * 1000).toISOString();
}

function signPlatformChallengeToken(user, sessionId, purpose) {
  if (!isPlatformSecretValid()) throw new PlatformAuthNotConfigured();
  return jwt.sign(
    {
      tokenType: "platform_mfa_challenge",
      role: user.role,
      sid: sessionId,
      purpose: purpose || "mfa_verify"
    },
    PLATFORM_JWT_SECRET,
    {
      expiresIn: PLATFORM_MFA_CHALLENGE_TTL,
      subject: user.id || user._id,
      audience: PLATFORM_MFA_AUDIENCE,
      issuer: PLATFORM_ISSUER
    }
  );
}

function verifyPlatformChallengeToken(token) {
  if (!isPlatformSecretValid()) throw new PlatformAuthNotConfigured();
  return jwt.verify(token, PLATFORM_JWT_SECRET, {
    audience: PLATFORM_MFA_AUDIENCE,
    issuer: PLATFORM_ISSUER
  });
}

function getPasswordChangedAtVersion(user) {
  const value = user?.passwordChangedAt;
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function signPlatformPasswordResetToken(user, requestId) {
  if (!isPlatformSecretValid()) throw new PlatformAuthNotConfigured();
  return jwt.sign(
    {
      tokenType: "platform_password_reset",
      pwdv: getPasswordChangedAtVersion(user)
    },
    PLATFORM_JWT_SECRET,
    {
      expiresIn: PLATFORM_PASSWORD_RESET_TTL,
      subject: user.id || user._id,
      audience: PLATFORM_PASSWORD_RESET_AUDIENCE,
      issuer: PLATFORM_ISSUER,
      jwtid: requestId
    }
  );
}

function verifyPlatformPasswordResetToken(token) {
  if (!isPlatformSecretValid()) throw new PlatformAuthNotConfigured();
  const decoded = jwt.verify(token, PLATFORM_JWT_SECRET, {
    audience: PLATFORM_PASSWORD_RESET_AUDIENCE,
    issuer: PLATFORM_ISSUER
  });
  if (decoded?.tokenType !== "platform_password_reset") {
    throw new Error("Token de recuperación inválido");
  }
  return decoded;
}

module.exports = {
  PLATFORM_AUDIENCE,
  PLATFORM_MFA_AUDIENCE,
  PLATFORM_PASSWORD_RESET_AUDIENCE,
  PLATFORM_ISSUER,
  PLATFORM_PASSWORD_RESET_TTL,
  signPlatformToken,
  verifyPlatformToken,
  getPlatformTokenExpiration,
  isPlatformSecretValid,
  PlatformAuthNotConfigured,
  signPlatformChallengeToken,
  verifyPlatformChallengeToken,
  signPlatformPasswordResetToken,
  verifyPlatformPasswordResetToken,
  getPasswordChangedAtVersion
};
