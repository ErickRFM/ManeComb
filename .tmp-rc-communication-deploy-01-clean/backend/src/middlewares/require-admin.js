function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin" || req.user?.accountType === "company_owner") {
    return res.status(403).json({
      ok: false,
      message: "Solo el administrador puede acceder a este recurso"
    });
  }

  return next();
}

module.exports = {
  requireAdmin
};
