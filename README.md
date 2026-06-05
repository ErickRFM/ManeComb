# Combis App

Base operativa para gestion de combis con:

- `mobile/`: app React Native CLI con login, dashboard, mapa, incidencias, chat y perfil.
- `backend/`: API Express con JWT, comercial, documentos, RTC, chat, incidencias, mapa y sockets.

## Arranque rapido

1. Backend:
   - `cd backend`
   - copia `.env.example` a `.env` si hace falta
   - `npm run dev`
2. Mobile:
   - `cd mobile`
   - copia `.env.example` a `.env` y ajusta la IP si usaras telefono fisico
   - Metro: `npm start`
   - Android emulator/celular USB: `npm run android`

## Accesos iniciales

- `admin@combis.app` / `Ruta123!`
- `supervisor@combis.app` / `Ruta123!`
- `chofer@combis.app` / `Ruta123!`

## Ruta comercial

- Con backend en `http://localhost:5000`, la ruta comercial vive dentro de la app mobile: `/ventas`, `/ventas/login`, `/ventas/registro`.

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
- Guia sin Expo para encender todo: `docs/how-to-run-without-expo.md`.
- Guia de conexion local movil/backend: `docs/conexion-mobile-backend-local.md`.
