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

/**
 * Logout es una operacion de teardown, no de acceso a datos. Para poder revocar
 * exactamente el `sid` firmado aun cuando el access token expiro mientras un
 * refresh estaba rotando, se valida SIEMPRE firma/integridad pero se tolera solo
 * la expiracion. El token no gana permisos: unicamente puede revocar su propia
 * sesion identificada por `sub + sid`.
 */
function verifyTokenForSessionTeardown(token) {
  return jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
}

module.exports = {
  buildAuthSession,
  getTokenExpiration,
  signToken,
  verifyToken,
  verifyTokenForSessionTeardown
};
