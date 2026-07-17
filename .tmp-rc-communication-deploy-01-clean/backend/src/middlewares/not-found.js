function notFound(req, res) {
  return res.status(404).json({
    ok: false,
    message: "Ruta no encontrada",
    traceId: req?.traceId || res?.locals?.traceId || null
  });
}

module.exports = {
  notFound
};
