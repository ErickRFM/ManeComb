const { Router } = require("express");
const { authenticate } = require("../../middlewares/authenticate");

const router = Router();

router.get("/", authenticate, async (req, res) => {
  return res.json({
    ok: true,
    data: await req.app.locals.store.getNotificationsForUser(req.user)
  });
});

router.post("/push-subscriptions", authenticate, async (req, res, next) => {
  try {
    await req.app.locals.store.registerPushSubscription(req.user.id, req.body || {});

    return res.status(201).json({
      ok: true
    });
  } catch (error) {
    error.statusCode = 400;
    error.publicMessage = "No fue posible registrar el dispositivo para push";
    return next(error);
  }
});

router.delete("/push-subscriptions/:token", authenticate, async (req, res) => {
  await req.app.locals.store.unregisterPushSubscription(req.user.id, req.params.token);

  return res.json({
    ok: true
  });
});

router.post("/:notificationId/read", authenticate, async (req, res) => {
  const notification = await req.app.locals.store.markNotificationAsRead(
    req.params.notificationId,
    req.user.id
  );

  if (!notification) {
    return res.status(404).json({
      ok: false,
      message: "Notificacion no encontrada"
    });
  }

  return res.json({
    ok: true,
    data: notification
  });
});

module.exports = router;
