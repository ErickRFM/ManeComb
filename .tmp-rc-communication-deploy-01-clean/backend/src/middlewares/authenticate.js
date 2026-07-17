const { verifyToken } = require("../utils/jwt");
const { isSessionActive } = require("../services/sessions");
const { getOrganizationId } = require("./access-control");

async function resolveAuthenticatedUser(store, token) {
  const payload = verifyToken(token);
  const user = await store.getUserById(payload.sub);

  if (!user || String(user.userStatus || "active").toLowerCase() === "suspended") {
    return null;
  }

  if (payload.sid && !(await isSessionActive(user.id, payload.sid))) {
    return null;
  }

  return { payload, user };
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({
      ok: false,
      message: "Falta token de autenticación"
    });
  }

  try {
    const resolved = await resolveAuthenticatedUser(
      req.app.locals.store,
      header.replace("Bearer ", "").trim()
    );

    if (!resolved) {
      return res.status(401).json({
        ok: false,
        message: "Sesión inválida"
      });
    }

    req.auth = resolved.payload;
    req.user = resolved.user;
    req.tenant = {
      organizationId: getOrganizationId(resolved.user),
      companyId: getOrganizationId(resolved.user)
    };
    return next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      message: "Token expirado o inválido"
    });
  }
}

module.exports = {
  authenticate,
  resolveAuthenticatedUser
};
