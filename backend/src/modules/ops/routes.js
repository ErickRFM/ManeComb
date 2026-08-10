const { Router } = require("express");

const router = Router();

router.use((req, res) => {
  return res.status(410).json({
    ok: false,
    code: "platform_authority_required",
    message: "Este recurso global fue retirado del plano operativo"
  });
});

module.exports = router;
