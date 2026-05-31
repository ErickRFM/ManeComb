const jwt = require("jsonwebtoken");
const { ACCESS_TOKEN_TTL, JWT_SECRET } = require("../config/env");

function signToken(user, sessionId = null) {
  return jwt.sign(
    {
      role: user.role,
      email: user.email,
      organizationId: user.organizationId || "",
      sid: sessionId || undefined
    },
    JWT_SECRET,
    {
      expiresIn: ACCESS_TOKEN_TTL,
      subject: user.id
    }
  );
}

function getTokenExpiration(token) {
  const decoded = jwt.decode(token);
  const exp = Number(decoded?.exp || 0);

  if (!exp) {
    return null;
  }

  return new Date(exp * 1000).toISOString();
}

function buildAuthSession(user, sessionId = null) {
  const token = signToken(user, sessionId);

  return {
    token,
    tokenExpiresAt: getTokenExpiration(token)
  };
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  buildAuthSession,
  getTokenExpiration,
  signToken,
  verifyToken
};
