const jwt = require("jsonwebtoken");
const { PLATFORM_JWT_SECRET, PLATFORM_ACCESS_TOKEN_TTL } = require("../config/env");

const PLATFORM_AUDIENCE = "manecomb-platform-admin";
const PLATFORM_ISSUER = "manecomb-api";

function signPlatformToken(user, sessionId) {
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

module.exports = {
  PLATFORM_AUDIENCE,
  PLATFORM_ISSUER,
  signPlatformToken,
  verifyPlatformToken,
  getPlatformTokenExpiration
};
