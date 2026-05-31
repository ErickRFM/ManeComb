const { verifyToken } = require("../utils/jwt");
const { getOrganizationId } = require("./access-control");

async function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({
      ok: false,
      message: "Falta token de autenticación"
    });
  }

  try {
    const payload = verifyToken(header.replace("Bearer ", "").trim());
    const user = await req.app.locals.store.getUserById(payload.sub);

    if (!user) {
      return res.status(401).json({
        ok: false,
        message: "Sesión inválida"
      });
    }

    req.auth = payload;
    req.user = user;
    req.tenant = {
      organizationId: getOrganizationId(user),
      companyId: getOrganizationId(user)
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
  authenticate
};
