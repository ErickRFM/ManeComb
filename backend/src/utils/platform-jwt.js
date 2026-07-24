const jwt = require("jsonwebtoken");
const { PLATFORM_JWT_SECRET, PLATFORM_ACCESS_TOKEN_TTL, PLATFORM_MFA_CHALLENGE_TTL } = require("../config/env");

const PLATFORM_AUDIENCE = "manecomb-platform-admin";
const PLATFORM_ISSUER = "manecomb-api";

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

function signPlatformChallengeToken(user, sessionId) {
  if (!isPlatformSecretValid()) throw new PlatformAuthNotConfigured();
  return jwt.sign(
    {
      tokenType: "platform_mfa_challenge",
      role: user.role,
      sid: sessionId
    },
    PLATFORM_JWT_SECRET,
    {
      expiresIn: PLATFORM_MFA_CHALLENGE_TTL,
      subject: user.id || user._id,
      audience: PLATFORM_AUDIENCE,
      issuer: PLATFORM_ISSUER
    }
  );
}

function verifyPlatformChallengeToken(token) {
  if (!isPlatformSecretValid()) throw new PlatformAuthNotConfigured();
  return jwt.verify(token, PLATFORM_JWT_SECRET, {
    audience: PLATFORM_AUDIENCE,
    issuer: PLATFORM_ISSUER
  });
}

module.exports = {
  PLATFORM_AUDIENCE,
  PLATFORM_ISSUER,
  signPlatformToken,
  verifyPlatformToken,
  getPlatformTokenExpiration,
  isPlatformSecretValid,
  PlatformAuthNotConfigured,
  signPlatformChallengeToken,
  verifyPlatformChallengeToken
};
