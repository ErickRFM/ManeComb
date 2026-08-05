# RC-RTC-FINALIZATION-20260805

## Veredicto

`CALLS_CODE_READY_DEVICE_CERT_PENDING`

La arquitectura de llamadas directas 1 a 1 quedó cerrada técnicamente en código, pruebas automatizadas y compilación Android. Ya existe un único flujo funcional sobre el socket compartido, con `callId` autoritativo, timbre global, aceptación confirmada, negociación WebRTC, audio/video, reconexión, controles y cleanup centralizados.

El único gate que no puede cerrarse desde CI es la certificación física entre dos teléfonos reales y la confirmación runtime de TURN en producción. Por ello no se declara todavía `CALLS_RELEASE_CERTIFIED`.

## Rama y pull request

- Rama: `fix/rtc-finalization-20260805`
- Pull request: `#7 fix(rtc): finalize global mobile call runtime and UI`
- Base: `main`
- Alcance protegido: no se modificó la lógica de GPS, rutas, pagos, Radio PTT, E2EE ni mensajería.

---

# Bloque D — Fuente única y experiencia global

## Estado

`CERRADO`

## Implementación

La llamada ya no depende de que la pantalla Chat esté montada. `CallOverlay` se mantiene en el root autenticado y monta:

- `IncomingCallModal`: timbre global con aceptar/rechazar.
- `ActiveCallModal`: experiencia global de llamada saliente, conectando, conectada, reconectando, terminada o fallida.

La interfaz activa funciona desde Mapa, Checklist, Perfil, Radio o cualquier otra pantalla. Incluye:

- cronómetro desde `connectedAt`;
- mute/unmute;
- cámara on/off en videollamada;
- cancelar mientras timbra;
- colgar durante conexión o llamada;
- video remoto;
- preview local;
- mensajes de fallo sanitizados;
- estado explícito de recuperación de señal.

El store global expone los streams local/remoto y es la única fuente observable del lifecycle nuevo.

## Regla de compatibilidad

`use-chat-controller.ts` conserva código RTC histórico como adaptador inerte para evitar un refactor destructivo del God Hook dentro de este cierre. Sin embargo:

- no crea un segundo `io()`;
- no hace `rtc:join` al abrir una conversación;
- `startCall` delega al store global;
- sus handlers históricos no reciben una sala local activa;
- no son propietarios del peer/media del flujo nuevo.

La eliminación física de ese código muerto es mantenimiento posterior y no es un gate funcional de esta entrega.

---

# Bloque E — Runtime WebRTC determinista

## Estado

`CERRADO_EN_CODIGO`

## Contrato de signaling

1. Caller emite `rtc:call { conversationId, mode }`.
2. Backend resuelve destinatario y genera `callId`.
3. Callee recibe `rtc:incoming-call` globalmente.
4. Callee emite `rtc:accept` y espera ACK autoritativo.
5. Solo después del ACK se inicia media/peer del callee.
6. Ambos runtimes emiten `rtc:join { callId }` y esperan ACK.
7. Backend autoriza por llamada activa, organización y pertenencia.
8. Caller es el offerer canónico.
9. Offer/answer/ICE se filtran por `callId`.
10. Cleanup emite `rtc:leave` una sola vez.

El ACK de `rtc:accept` elimina la carrera `accept -> join(not_accepted)`. El ACK de `rtc:join` falla cerrado ante:

- `busy`;
- `forbidden`;
- `not_accepted`;
- `call_ended`;
- `unknown_call`;
- timeout de ACK.

La UI nunca muestra detalles internos del backend; usa códigos sanitizados.

## Media

- ICE config se obtiene antes de crear el peer.
- No existe fallback silencioso si la config no está disponible.
- Se captura audio siempre.
- En modo video se exige también una pista de video.
- Todas las pistas locales se agregan al `RTCPeerConnection`.
- Mute conmuta `audioTrack.enabled`.
- Cámara conmuta `videoTrack.enabled`.
- Cleanup detiene cada pista una sola vez.

## Condición CONNECTED

`CONNECTED` solo ocurre cuando se cumplen simultáneamente:

1. dos participantes lógicos;
2. `peer.connectionState === connected`;
3. existe audio remoto;
4. la pista remota de audio está viva.

El cronómetro no corre durante ringing o connecting.

## Reconexión

- `CONNECTED -> RECONNECTING` ante pérdida del peer/socket.
- Gracia de 15 segundos.
- Caller intenta `restartIce` y una offer con `iceRestart`.
- Al recuperar el socket se repite el join autoritativo.
- La recuperación conserva el `connectedAt` original.
- Al vencer la gracia se cierra con `reconnect_timeout`.

## Diagnóstico TURN/P2P

Tras conectar, el runtime inspecciona el candidate pair seleccionado y reporta únicamente:

```text
usedRelay: true | false
```

No transmite SDP, candidatos completos, IPs, credenciales TURN ni tokens.

---

# Bloque F — Android y lifecycle

## Estado

`CERRADO_EN_CODIGO`

El foreground service Android ahora depende del store global, no de un estado local de Chat.

Se inicia en:

- `CONNECTING`;
- `CONNECTED`;
- `RECONNECTING`.

Se detiene en:

- rechazo;
- cancelación;
- timeout;
- hangup local/remoto;
- fallo de media/ICE;
- logout;
- desmontaje del overlay.

También se corrigió `mobile/android/app/build.gradle` para resolver Node desde `PATH` en Windows y Linux, preservando `NODE_BINARY` como override. Se eliminó la ruta local congelada `C:\Program Files\nodejs\node.exe`, que bloqueaba GitHub Actions en Linux.

---

# Bloque G — Pruebas y gates

## Estado

`CERRADO`

## Cobertura automatizada añadida

### Máquina de estados

- ringing entrante/saliente;
- aceptación a CONNECTING;
- CONNECTED solo desde CONNECTING;
- `CONNECTED -> RECONNECTING -> CONNECTED`;
- `connectedAt` estable;
- terminales y RESET.

### Store global

- timbre desde cualquier pantalla;
- `callId` proveniente del ACK backend;
- busy/direct-call gate;
- accept espera ACK antes del runtime;
- accept rechazado no crea peer/media;
- streams globales;
- timeout inicial;
- fallos sanitizados;
- mute/cámara;
- endCall;
- callback tardío de llamada vieja ignorado;
- cleanup idempotente;
- reemplazo de socket sin listeners duplicados.

### Runtime con doubles

- mapeo de errores de join;
- filtrado por `callId`/sala canónica;
- audio + video agregados al peer;
- offer única del caller;
- requisito de audio remoto vivo;
- reporte `usedRelay`;
- mute/cámara;
- `rtc:leave` una sola vez;
- tracks detenidos una sola vez;
- reconexión y recuperación.

## CI confirmado

GitHub Actions run `31030515059` sobre el commit `3a092a92cabf44f3b4588ee2bcbacaf760209cc8`:

- Backend tests: `PASS`.
- Mobile typecheck: `PASS`.
- Mobile lint: `PASS`.
- Mobile tests: `PASS`.
- Ventas typecheck/build: `PASS`.
- Android `assembleDebug`: `BUILD SUCCESSFUL`.
- Upload del artefacto APK: `PASS`.

Artefacto:

- Nombre: `manecomb-debug-apk`
- ID: `8940968066`
- ZIP SHA-256: `736720bc39488624ed5b406db5b11f85c3f16922341f1d05a12727e408ffb24a`
- APK extraído SHA-256: `8608413eb4581278851b880ae65c4a041d2f122ab01b10b4ecd8491a183e2f6f`

El APK de CI es **debug y de certificación técnica**, no reemplaza el release firmado. El runner no tenía el `.env` local del propietario; para una APK funcional de distribución deben inyectarse las variables públicas necesarias —especialmente Mapbox— y el keystore release.

---

# Bloque H — Certificación física pendiente

## Estado

`PENDIENTE_DISPOSITIVO`

Debe ejecutarse con dos teléfonos y cuentas del mismo tenant:

1. Llamada de audio en la misma Wi-Fi.
2. Audio bidireccional real durante al menos 60 segundos.
3. Mute/unmute en ambos extremos.
4. Rechazar, cancelar, ocupado y timeout.
5. Videollamada: video remoto y preview local.
6. Cámara on/off.
7. Cambiar Wi-Fi/datos durante llamada y validar RECONNECTING.
8. Una terminal en Wi-Fi y otra en datos móviles.
9. App en segundo plano y pantalla bloqueada en Android.
10. Confirmar que `GET /api/rtc/config` devuelve `turnEnabled: true` en producción.
11. Confirmar al menos una llamada entre redes con `usedRelay: true` cuando el NAT lo requiera.
12. Verificar que micrófono/cámara se liberan al colgar y al cerrar sesión.

## Criterio de liberación

Solo después de esas pruebas puede cambiarse el veredicto a:

```text
CALLS_RELEASE_CERTIFIED
```

Hasta entonces, el código está listo para prueba de dispositivo y la APK debug está lista para instalación controlada, pero no se afirma que audio/TURN/background hayan sido certificados físicamente.
