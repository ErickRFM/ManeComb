# Combis App

Base operativa para gestion de combis con:

- `mobile/`: app Expo Router con login, dashboard, mapa, incidencias, chat y perfil.
- `backend/`: API Express con JWT, comercial, documentos, RTC, chat, incidencias, mapa y sockets.

## Arranque rapido

1. Backend:
   - `cd backend`
   - copia `.env.example` a `.env` si hace falta
   - `npm run dev`
2. Mobile:
   - `cd mobile`
   - copia `.env.example` a `.env` y ajusta la IP si usaras telefono fisico
   - web / LAN local: `npm run web`
   - telefono fisico con Expo Go: `npm run start:phone`
   - telefono fisico en la misma Wi-Fi: `npm run start:phone:lan`

## Accesos iniciales

- `admin@combis.app` / `Ruta123!`
- `supervisor@combis.app` / `Ruta123!`
- `chofer@combis.app` / `Ruta123!`

## Ruta comercial web

- Con backend en `http://localhost:5000` y Expo Web activo, abre `http://localhost:8081/ventas`.

## Notas

- Con `REQUIRE_MONGO=true`, el backend exige MongoDB y ya no degrada silenciosamente a memoria.
- La landing `/ventas` ya consume checkout comercial, confirmacion de pago y seguimiento de activacion.
- Documentos usan `MongoDB GridFS` por defecto para que el binario ya no dependa del disco local. `Cloudinary` sigue disponible como opcion externa.
- RTC expone STUN por defecto y TURN cuando configuras `TURN_URLS` junto con `TURN_USERNAME`/`TURN_CREDENTIAL`, o TURN dinamico tipo Coturn REST con `TURN_SECRET`, `TURN_REALM` y `TURN_CREDENTIAL_TTL_SECONDS`.
- Push ya soporta acciones profundas hacia `chat`, `radio` e `incidencias/SOS` cuando las notificaciones incluyen `deepLink`.
- El chat directo ya puede respaldar claves E2EE por dispositivo usando `/api/auth/e2ee-backup`.
- La transcripcion de audio se activa con `AUDIO_TRANSCRIPTION_PROVIDER`, `AUDIO_TRANSCRIPTION_API_KEY` y, si no usas OpenAI, `AUDIO_TRANSCRIPTION_API_URL`.
- El backend propaga `x-trace-id` y puede reenviar errores a Sentry si configuras `SENTRY_DSN`.
- Base E2E:
  - web: `cd mobile && npm run test:e2e:web`
  - movil: `cd mobile && npm run build:e2e:mobile && npm run test:e2e:mobile`
- Para Expo Go en telefono fisico, `start:phone` detecta la IP actual de tu laptop, actualiza `mobile/.env` y usa `--go --tunnel -c`.
- Guia de conexion local movil/backend: `docs/conexion-mobile-backend-local.md`.
