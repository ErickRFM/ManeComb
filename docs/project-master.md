# Proyecto App Gestion de Combis - Estado Actual

## Estado actual

- `backend/` incluye auth JWT, dashboard, mapa operativo, incidencias, chat, documentos, notificaciones, comercial y Socket.IO.
- `mobile/` incluye login, dashboard, mapa, incidencias, chat, perfil, llamadas RTC y landing comercial web.
- Con `REQUIRE_MONGO=true`, la API ya no degrada silenciosamente a memoria en runtime.
- Los documentos ya pueden vivir en `MongoDB GridFS`, con metadata y binario persistidos en la misma base.

## Cuentas iniciales

- `admin@combis.app` / `Ruta123!`
- `supervisor@combis.app` / `Ruta123!`
- `chofer@combis.app` / `Ruta123!`

## API disponible

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/session`
- `GET /api/dashboard/overview`
- `GET /api/locations/live`
- `POST /api/locations/update`
- `GET /api/incidents`
- `POST /api/incidents`
- `PATCH /api/incidents/:incidentId/status`
- `GET /api/chat/conversations`
- `GET /api/chat/conversations/:conversationId/messages`
- `POST /api/chat/conversations/:conversationId/messages`
- `GET /api/documents`
- `GET /api/documents/admin`
- `POST /api/documents`
- `PATCH /api/documents/:documentId/review`
- `GET /api/notifications`
- `POST /api/notifications/:notificationId/read`
- `GET /api/commercial/plans`
- `POST /api/commercial/checkout`
- `POST /api/commercial/confirm`
- `POST /api/commercial/webhooks/mercadopago`
- `GET /api/commercial/orders`
- `PATCH /api/commercial/orders/:orderId`
- `GET /api/rtc/config`
- `GET /api/rtc/sessions`
- `GET /api/users/me`
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:userId`
- `DELETE /api/users/:userId`
- `GET /api/vehicles`

## UX implementada

- Navegacion por tabs clara y en espanol.
- Interfaz oscura con cards operativas, botones grandes y estados visuales.
- Login con cuentas iniciales y registro de usuarios.
- Mapa operativo con fallback web y geolocalizacion del dispositivo.
- Flujo de incidencias con alta y seguimiento.
- Chat interno con rooms de Socket.IO.
- Perfil con documentos, apertura de archivos y cierre de sesion.
- Panel admin con leads, compras, activaciones, revision documental e historial RTC.
- Landing web `/ventas` con compra comercial y confirmacion de pago.

## Siguiente nivel recomendado

- Activacion automatica despues del pago.
- Alta inicial de flotilla y onboarding guiado para empresas.
- Push notifications con Expo/FCM.
- Seguimiento GPS continuo en background.
- Roles y permisos mas finos por ruta y patio.
