const { Router } = require("express");
const routeWriteGuard = require("./route-write-guard");
const segmentReviewRoutes = require("./segment-review-routes");

const router = Router();

// Primero protege la autoridad de una Route activa; después expone revisión/apply.
// Ambos routers viven bajo /api/navigation y el router legacy se monta a continuación
// en app.js, por lo que V2 conserva sus endpoints no interceptados.
router.use(routeWriteGuard);
router.use(segmentReviewRoutes);

module.exports = router;
