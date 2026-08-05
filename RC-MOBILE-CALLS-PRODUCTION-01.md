# RC-MOBILE-CALLS-PRODUCTION-01

## Veredicto de Fase 0

`CALLS_BLOCKED_IMPLEMENTATION`

El contrato activo contradice el diseño requerido. Conforme al gate de la Fase 0, no se implementaron las Fases 1–8.

## Árbol RTC activo

### Backend

- El socket autenticado se establece en `backend/src/sockets/index.js:200-216`.
- Las únicas operaciones de sala activas son `rtc:join`, `rtc:leave`, `rtc:offer`, `rtc:answer`, `rtc:ice-candidate` y `rtc:stats` (`backend/src/sockets/index.js:1071-1193`).
- `rtc:join` valida acceso a la conversación, organización y capacidad máxima de dos sockets (`backend/src/sockets/index.js:1077-1119`).
- El servidor publica participantes inmediatamente al hacer join (`backend/src/sockets/index.js:287-291`, `1115-1119`).
- Offer/answer/ICE solamente se retransmiten entre sockets que ya pertenecen a la sala (`backend/src/sockets/index.js:1128-1168`).
- La desconexión retiene la sala durante 15 segundos y luego ejecuta cleanup (`backend/src/sockets/index.js:1195-1221`).
- `/api/rtc/config` está autenticado y devuelve la configuración construida por backend (`backend/src/modules/rtc/routes.js:8-14`).

No existen handlers activos para:

- `rtc:call`
- `rtc:incoming-call`
- `rtc:accept`
- `rtc:cancel`
- `rtc:call-accepted`
- `rtc:call-rejected`
- `rtc:call-cancelled`
- `rtc:call-timeout`
- `rtc:end`

Por tanto, actualmente no existe reserva de llamada pendiente, destinatario resuelto por backend, timbre, aceptación ni timeout de ring.

### Mobile

- `root-store.ts` mantiene el socket compartido y lo expone mediante `getSharedRealtimeSocket` (`mobile/src/store/root-store.ts:148-150`).
- Sin embargo, `use-chat-controller.ts` crea otro `io(SOCKET_URL, ...)` propio (`mobile/src/screens/chat/hooks/use-chat-controller.ts:143-155`). Esto contradice el requisito de no duplicar sockets.
- Todos los listeners RTC viven dentro del controller de la pantalla de chat (`mobile/src/screens/chat/hooks/use-chat-controller.ts:338-616`). No hay listener global en `root-store.ts`.
- Al abrir una conversación, el cliente ejecuta `rtc:join` aunque no exista una llamada (`mobile/src/screens/chat/hooks/use-chat-controller.ts:769-791`).
- Al pulsar llamar, captura media local, crea estado `calling` y vuelve a ejecutar `rtc:join`; nunca emite `rtc:call` (`mobile/src/screens/chat/hooks/use-chat-controller.ts:793-850`).
- Un usuario situado en Mapa no monta estos listeners ni entra a la sala. Por eso no puede recibir una invitación global.

## Estado y cronómetro actuales

- El estado de llamada es local al hook y está repartido entre `callSession`, `callParticipants`, `callNotice`, refs y booleanos (`mobile/src/screens/chat/hooks/use-chat-controller.ts:110-140`).
- `joinedAt` se fija al iniciar la llamada, antes de tener otro participante o media remota (`mobile/src/screens/chat/hooks/use-chat-controller.ts:823-830`).
- El timer calcula desde `joinedAt` y arranca siempre que exista ese campo (`mobile/src/screens/chat/hooks/use-chat-controller.ts:1097-1108`, `1387-1400`).
- En consecuencia, hoy el cronómetro avanza durante `calling/ringing`, no desde una transición comprobada a `CONNECTED`.
- `1 en cabina` se fuerza con `Math.max(callParticipants.length, 1)` (`mobile/src/screens/chat/components/chat-screen-view.tsx:467-469`).

## Peer y media

- El peer añade los tracks locales al construirse (`mobile/src/screens/chat/hooks/use-chat-controller.ts:212-233`).
- La negociación empieza cuando aparecen dos sockets en `rtc:participants`; el socket con ID lexicográficamente menor crea el offer (`mobile/src/screens/chat/hooks/use-chat-controller.ts:338-404`).
- El receptor crea media y answer al recibir el offer (`mobile/src/screens/chat/hooks/use-chat-controller.ts:407-469`). Esto funciona solo si ya está dentro de la misma conversación/sala.
- `ontrack` marca la sesión como `connected` al recibir un stream, sin comprobar explícitamente que exista un track de audio vivo (`mobile/src/screens/chat/hooks/use-chat-controller.ts:247-264`).
- `connectionState === connected` también marca `connected` por separado (`mobile/src/screens/chat/hooks/use-chat-controller.ts:266-278`). No existe una transición única que exija simultáneamente dos participantes, peer conectado y audio remoto.

## ICE y TURN

- El cliente inicializa una configuración STUN local antes de consultar backend (`mobile/src/screens/chat/hooks/use-chat-controller.ts:132-135`).
- `/rtc/config` se solicita de forma asíncrona y el error se ignora (`mobile/src/screens/chat/hooks/use-chat-controller.ts:156-160`).
- `RTCPeerConnection` usa el valor que exista en el ref en ese instante (`mobile/src/screens/chat/hooks/use-chat-controller.ts:224-226`). Existe una carrera: puede construirse con STUN antes de recibir ICE/TURN.
- Backend soporta TURN dinámico Coturn REST y TURN estático (`backend/src/services/rtc-config.js:11-67`). Si no hay variables, devuelve solo STUN (`backend/src/services/rtc-config.js:39-70`).
- El repositorio no demuestra qué variables están configuradas en producción. `turnEnabled` de producción queda **PENDIENTE DE CONFIRMACIÓN RUNTIME**; no se inspeccionaron credenciales ni variables.
- El cliente reporta únicamente `usedRelay`, pero no registra de forma completa y sanitizada `connectionState`, `iceConnectionState`, candidate-pair type o failure code (`mobile/src/screens/chat/hooks/use-chat-controller.ts:172-209`).

## Cleanup activo

- El peer remueve callbacks y se cierra mediante `resetPeerConnection` (`mobile/src/screens/chat/hooks/use-chat-controller.ts:161-170`).
- Tracks, peer, timer y socket local se limpian al desmontar el controller (`mobile/src/screens/chat/hooks/use-chat-controller.ts:618-636`).
- El cierre manual detiene tracks, peer y timer (`mobile/src/screens/chat/hooks/use-chat-controller.ts:1124-1151`).
- Cambio de conversación termina la llamada local (`mobile/src/screens/chat/hooks/use-chat-controller.ts:1419-1443`).
- Logout desconecta el socket compartido (`mobile/src/store/root-store.ts:1895-1908`), pero la sesión RTC no vive en ese store; su cleanup depende del desmontaje del controller y de su segundo socket.
- Los listeners mobile `rtc:busy`, `rtc:reject` y `rtc:timeout` (`mobile/src/screens/chat/hooks/use-chat-controller.ts:550-593`) no tienen emisores equivalentes en el backend activo: están pendientes de cableado, no constituyen un flujo funcional.

## UI actual

- Audio renderiza dos `CallMediaTile`, incluido un tile remoto sin video (`mobile/src/screens/chat/components/chat-screen-view.tsx:382-418`).
- Cada tile tiene un mínimo de 180 px en teléfono y se apila en columna (`mobile/src/screens/chat/chat-screen.styles.ts:666-679`).
- El fallback ocupa todo el tile y usa un icon shell grande (`mobile/src/screens/chat/chat-screen.styles.ts:699-717`).
- Los controles y metadatos se agregan debajo de ambos tiles (`mobile/src/screens/chat/components/chat-screen-view.tsx:420-476`), explicando el desbordamiento observado en pantallas pequeñas.

## Clasificación de rutas

| Ruta | Estado |
| --- | --- |
| Sala `rtc:join` + participants + offer/answer/ICE | VIVA, limitada a usuarios ya montados en Chat |
| Socket RTC creado dentro del chat | VIVO, pero duplica el socket compartido |
| `rtc:call` / `rtc:incoming-call` | MUERTO/AUSENTE en código activo |
| Listeners mobile `rtc:busy/reject/timeout` | PENDIENTES DE CABLEAR; no tienen emisor backend |
| Timbre global | AUSENTE |
| Estado global de llamada | AUSENTE |
| TURN en código | VIVO como capacidad configurable |
| TURN en producción | PENDIENTE DE CONFIRMACIÓN RUNTIME |

## Contradicciones que activan STOP

1. El diseño exige `rtc:call → rtc:incoming-call → accept → join`; el código hace join al abrir el chat y carece de call/incoming-call.
2. El diseño exige un único socket compartido; el controller crea un segundo socket.
3. El diseño exige estado global; el estado vive dentro de una pantalla.
4. El diseño exige timer desde `CONNECTED`; hoy arranca desde `joinedAt`.
5. El diseño exige esperar ICE config; hoy existe fallback STUN previo y error silencioso.
6. El diseño exige audio UI compacta; hoy audio usa dos tiles altos de media.

No se hicieron cambios de signaling, WebRTC, lifecycle ni UI en esta fase.

---

# Bloque A — Backend signaling autoritativo (implementado)

> `CALLS_PHASE_0_APPROVED` → implementación desbloqueada. Bloque A: **solo backend**. Rama `rc-mobile-calls-production-01`. Suite backend completa **verde**. **Sin push/merge.** STOP técnico antes de tocar WebRTC mobile.

## Qué se implementó
Servicio de signaling `backend/src/services/rtc-call-service.js` (estado en memoria, lógica pura respecto a la red: recibe `emitToUser` inyectado y un scheduler inyectable → testeable sin `socket.io-client`, que el repo no tiene). Cableado en `backend/src/sockets/index.js` sobre el **socket autenticado compartido** (reutiliza `user:{id}`, `canUseOperations`, `getOrganizationId`, `acknowledge`, `observeSocketEvent`).

## Decisiones aplicadas
- **`callId` lo genera el backend** (`randomUUID`) y se devuelve por **ACK** de `rtc:call`. El cliente nunca lo decide.
- **Sala por llamada** `call:{callId}` (el socket layer la prefija a `rtc:call:{callId}`); `conversationId` se conserva para autorización.
- **Destinatarios resueltos por backend** desde los participantes de la conversación (nunca desde el cliente).
- **Aislamiento por organización**: la conversación debe ser del mismo tenant del caller; cross-tenant → `forbidden` sin emitir.
- **Reserva de ocupación por usuario** (`userState`): un segundo caller a un destinatario ocupado recibe `busy`.
- **Idempotencia por `callId`**: eventos de una llamada terminada se ignoran (ok idempotente, sin re-emitir).
- **Timeout de ring 35 s** → `rtc:call-timeout` a ambos + liberación.
- **Logs sanitizados**: solo `callId`/`reason`; nunca SDP/ICE/tokens/credenciales.

## Eventos (todos con `callId`)
- Entrada cliente→server: `rtc:call` (ACK `{callId, roomId, status}`), `rtc:accept`, `rtc:reject`, `rtc:cancel`, `rtc:busy`, `rtc:end`.
- Salida server→cliente: `rtc:incoming-call`, `rtc:call-accepted`, `rtc:call-rejected`, `rtc:call-cancelled`, `rtc:call-timeout`, `rtc:end`.

## Limitación documentada (§decisión 8)
El registro pending/active es **en memoria** → asume **una sola instancia de backend**. Con múltiples réplicas, la reserva deberá centralizarse (p.ej. Redis). Queda identificado como cambio futuro; no se implementa ahora.

## Pruebas (backend, en `npm test`)
`test/rtc-call-signaling.test.js` — 10 casos verdes: (1) llamada autorizada + `callId` backend; (2) **solo participantes** reciben `rtc:incoming-call`; (3) **cross-tenant bloqueado** sin fuga; (4) accept notifica a ambos; (5) reject; (6) cancel; (7) **busy** (destinatario ocupado); (8) timeout de ring; (9) **end idempotente** (no re-emite); (10) **disconnect** limpia la llamada e informa al otro extremo. Suite backend completa **verde (EXIT=0)**.

## Diferido a bloques siguientes
- **Autorización de join a la sala `rtc:call:{callId}`** y eliminación del `rtc:join` al abrir chat → **Bloque C** (junto con el pipeline de peer/media mobile), para no romper el join actual antes de reescribir el cliente.
- Estado global mobile + socket único + timbre global → **Bloque B**.
- Peer/audio deterministas (esperar ICE config, CONNECTED real, timer desde `connectedAt`) → **Bloque C**.
- UI compacta de audio → **Bloque D**.

**Commit:** `feat(rtc): add authoritative global call signaling`. **STOP para revisión** antes del Bloque B.

---

# A.1 — Endurecimiento del contrato directo y del lifecycle de desconexión (implementado)

> Cierre solicitado antes del Bloque B. Solo backend. Suite completa **verde**. **Sin push/merge.**

## 1. Alcance: solo llamadas DIRECTAS (2 participantes)
`startCall` ahora exige que la conversación tenga **exactamente 2 participantes** (caller + un único callee). Menos o más → ACK `{ ok:false, code:"direct_call_required" }`: **no** genera `callId`, **no** reserva usuarios, **no** emite `rtc:incoming-call`. La comunicación grupal permanece en Radio; General Operativo no inicia llamadas RTC de Chat.

## 2. Namespace canónico `rtc:call:{callId}`
Se eliminó la ambigüedad con `call:{callId}`. El servicio devuelve y emite **`rtc:call:{callId}`** (helper `callRoom`). El futuro `rtc:join` (Bloque C) recibirá `callId` y validará: la llamada existe, está aceptada, el usuario pertenece a ella y no está terminada — **sin** confiar en el `conversationId` del cliente para autorizar el join.

## 3. Desconexión con gracia de 15 s
`handleDisconnect(socketId, { isUserConnected })` ya **no** limpia de inmediato:
- si el usuario **conserva** otro socket autenticado → no se programa cleanup;
- si no, se programa cleanup a **15 s** (alineado con la retención RTC);
- si **recupera** un socket (presence:join → `noteUserReconnected`) dentro del plazo → se **cancela** el cleanup;
- al vencer → termina la llamada, libera reservas y notifica al otro extremo con `rtc:end` **reason `peer_disconnected`**.
Timers y cleanup **idempotentes** (`pendingDisconnects`, se limpian al finalizar).

## 4. Códigos de ACK y validación
Rechazos de ACK unificados en **`code`** (`invalid_request`, `forbidden`, `invalid_mode`, `direct_call_required`, `caller_busy`, `busy`, `unknown_call`, `already_active`). Los `reason` quedan solo en payloads de eventos emitidos (`timeout`, `busy`, `cancelled`, `peer_disconnected`, …). El cliente **no** puede elegir caller/callee: el caller es el usuario autenticado y el callee sale de los participantes reales.

## Pruebas (A.1, en `npm test`)
`test/rtc-call-signaling.test.js` ampliado: grupal rechazada; incompleta rechazada; payload no elige caller/callee; `mode` inválido; accept tras timeout; accept duplicado; reject/cancel/end duplicados; **disconnect definitivo tras gracia (peer_disconnected)**; **reconexión dentro de la gracia cancela cleanup**; **conserva otro socket → sin cleanup**; namespace `rtc:call:{callId}`. Suite backend completa **verde (EXIT=0)**.

**Commit:** `fix(rtc): harden direct call contract and disconnect lifecycle`. **STOP para revisión** antes del Bloque B.

---

# Bloque B — Estado global mobile, socket único y timbre global (implementado)

> Solo lifecycle de signaling mobile; **sin negociar WebRTC** (media/join/mic/CONNECTED = Bloque C). Rama `rc-mobile-calls-production-01`. **Sin push/merge.**

## Módulo dedicado `mobile/src/features/calls/`
- `call-types.ts` — tipos (fases, `CallState` con los campos mínimos, `IncomingCallPayload`, `CallSocket`).
- `call-machine.ts` — **transición única** `reduce(state, event)` (pura, sin RN). Fases `IDLE / OUTGOING_RINGING / INCOMING_RINGING / CONNECTING / ENDING / FAILED` (+ `CONNECTED` en el tipo, **no alcanzable** en B). Sin booleanos contradictorios: `phase` es la verdad.
- `call-signaling.ts` — binder del socket compartido: registra **una vez** los listeners y los quita con `off` puntual (nunca `removeAllListeners`); `emitStartCall` espera el **ACK** con el `callId` del backend.
- `call-store.ts` — store zustand (vive junto al socket, **no** en una pantalla): `startCall / acceptIncomingCall / rejectIncomingCall / cancelOutgoingCall` + handlers `handleIncoming/Accepted/Rejected/Cancelled/Timeout/RemoteEnd` + `bindSocket/unbindSocket/reset`. Idempotente; vuelve a IDLE tras mostrar brevemente el resultado.
- `call-selectors.ts` — selectores + `canConversationStartCall` (gate directo/grupal).
- `components/incoming-call-modal.tsx` — modal global.
- `call-overlay.tsx` — enlaza el socket compartido y monta el modal.

## Socket único
- Se **eliminó** el segundo `io(SOCKET_URL, …)` de `use-chat-controller.ts`; ahora consume `getSharedRealtimeSocket()`.
- El binder del store registra **exactamente una vez** por instancia; si cambia la instancia (re-auth) quita los del socket anterior y registra en el nuevo; un **reconnect** (misma instancia) no acumula listeners.
- El chat controller **no** es dueño del lifecycle (ya no `disconnect()` ni `removeAllListeners()`): quita **solo** sus handlers (registro rastreado). **Deuda temporal documentada:** su offer/answer/ICE/join siguen ahí como adaptador hasta el Bloque C (que reescribe el pipeline y mueve el join). No registra listeners globales de incoming-call.

## Timbre global
- `presence:join` se emite en el socket compartido tras autenticar (root-store) → el `user:{userId}` recibe `rtc:incoming-call` **desde cualquier pantalla** (Mapa/Chat/Checklist/Perfil/Usuarios/Radio/otra conversación), sin depender de Chat.
- El `IncomingCallModal` se monta en el **root** (`App.tsx`, gated a sesión), por encima de los navegadores; no navega, no monta Chat, no crea peer, no pide micrófono. Guard de doble-tap y safe areas.

## Contrato de acciones (Bloque B)
- `startCall({conversationId, mode})`: verifica IDLE → emite `rtc:call` → espera ACK → toma el `callId` backend → `OUTGOING_RINGING`. Maneja `busy/direct_call_required/invalid_mode/…`. **No** join, **no** micrófono, **no** cronómetro. No confía en caller/callee del cliente.
- `rtc:incoming-call`: valida payload, ignora duplicados por `callId`, si IDLE → `INCOMING_RINGING`, si ocupado → `rtc:busy`. No navega ni crea peer.
- `acceptIncomingCall()`: `CONNECTING` + `rtc:accept` + `acceptedAt`. **No** `rtc:join`, **no** CONNECTED (eso es C).
- reject/cancel + handlers remotos (rejected/cancelled/timeout/end/busy): limpian idempotente y vuelven a IDLE.

## Conversaciones grupales
El botón de llamada se **oculta** en conversaciones no directas (`canConversationStartCall`) y se muestra "Las llamadas grupales se realizan en Radio". El backend igual rechaza (`direct_call_required`).

## Pruebas mobile
`src/features/calls/call-machine.test.ts` + `src/features/calls/call-store.test.ts` (en el runner jest): 21 casos cubriendo incoming global, `callId` del ACK, busy→IDLE, `direct_call_required` sin sesión, accept→CONNECTING (no CONNECTED), rechazo/cancelación/timeout limpian, duplicado no crea segundo modal, nuevo socket reemplaza listeners, logout limpia, login no conserva llamada vieja, gate grupal, y **sin segundo `io()`** en el controller.

## Validación
- `npm run typecheck`: **PASS (exit 0)**.
- `jest` (módulo de llamadas + relacionados): **PASS** (33/33 en el subconjunto ejecutado).
- `assembleDebug`: **BUILD SUCCESSFUL** → `android/app/build/outputs/apk/debug/app-debug.apk` generado.

## Alcance y restricciones
No toca rutas múltiples/GPS/ventas/portal/mensajes/E2EE. **No** negocia WebRTC (media = Bloque C). Sin push/merge/PR.

## Deuda temporal documentada (para Bloque C)
El `use-chat-controller.ts` conserva su pipeline offer/answer/ICE/join sobre el socket compartido como **adaptador temporal**. Bloque C: reescribir peer/media, eliminar el `rtc:join` automático al abrir conversación, hacer join a `rtc:call:{callId}` solo tras aceptar, exigir CONNECTED real (2 participantes + peer connected + remote audio) y cronómetro desde `connectedAt`.

**Commit:** `feat(rtc): add global mobile call state machine`. **STOP para revisión** antes del Bloque C.

---

# Bloque C.1 — Autorización de join por callId (backend, implementado)

> Primer commit del Bloque C. Solo backend. Suite completa **verde**. **Sin push/merge.**

## Cambios
- `rtc-call-service.js`: `getCall(callId)`, `canJoinCall({callId,userId,organizationId})`, `isCallMember(callId,userId)`. La autoridad de join sale del registro de llamadas, **no** del cliente.
- `sockets/index.js`:
  - `rtc:join` ahora recibe `{ callId }` y valida vía `canJoinCall`: existe, **aceptada/activa**, no terminada, usuario ∈ llamada (caller o callee aceptado), organización consistente. Sala interna `call:{callId}` → `rtc:call:{callId}` (namespace canónico). Reutiliza la lógica existente de max 1 socket por usuario / max 2 sockets. **Ya no** usa `conversationId` ni `canUserAccessConversation` para autorizar.
  - `rtc:leave / rtc:offer / rtc:answer / rtc:ice-candidate / rtc:stats` migrados a `{ callId }`; derivan la sala `call:{callId}` y validan pertenencia (`isSocketInRtcRoom` + `isCallMember`). Los eventos relay incluyen `callId`; un evento de otra llamada se ignora (no está en esa sala). No confían en room/conversationId/callee del cliente.

## Pruebas (backend, en `npm test`)
`rtc-call-signaling.test.js` (sección C.1): sin callId / inexistente → `unknown_call`; ringing → `not_accepted`; caller+callee aceptados → ok; sala canónica; ajeno/tercero → `forbidden`; org inconsistente → `forbidden`; `isCallMember` (caller/callee true, ajeno false); terminada → limpia (`getCall` null). Suite backend completa **verde (EXIT=0)**.

## Límite de validación (honesto)
Las pruebas ejercitan la **lógica autoritativa** del join (`canJoinCall`/`isCallMember`) directamente. La retransmisión a nivel socket (offer/answer/ICE con callId incorrecto ignorados; reconnect no duplica participante lógico) se apoya en los guards existentes `isSocketInRtcRoom` + `isCallMember`; no se ejercita con un cliente socket.io real (el repo no lo tiene en tests).

**Commit:** `fix(rtc): authorize call rooms by authoritative call id`. Continúa el Bloque C con el pipeline mobile (C.2–C.9).

---

# Bloque C.2–C.9 — Peer, audio y negociación deterministas (mobile, implementado)

> Segundo commit del Bloque C. Rama `rc-mobile-calls-production-01`. **Sin push/merge.** La conexión de media real se certifica en **dispositivo** (`CALLS_RELEASE_BLOCKED` hasta la prueba física).

## Módulos nuevos en `mobile/src/features/calls/` (propietario global del peer)
- `call-ice.ts` (C.4): `validateIceConfig` / `resolveIceConfig`. STUN-only y STUN+TURN válidos; vacía/inválida/fallo → `rtc_config_unavailable` (**sin fallback silencioso a STUN**). Diagnóstico sanitizado (solo `turnEnabled` + `iceServerCount`; nunca credenciales/urls).
- `call-peer.ts` (C.5/C.6): `isCanonicalOfferer` (**el caller es el offerer**, no por socket id), `createIceQueue` (encola antes de remote description, drena en orden, ignora otro callId), `evaluateConnected` (**las 4 condiciones**), `remoteAudioSignals`.
- `call-media.ts` (C.8): `acquireLocalMedia` (mic/permiso), `setMicEnabled` (mute = `track.enabled`), `stopLocalMedia`.
- `call-runtime.ts` (C.2/C.3/C.5/C.7): runtime nativo, **propietario único** de peer/localStream/remoteStream/candidatos/negociación/cleanup de UNA llamada. Secuencia: ICE config (obligatoria) → media → peer → `rtc:join {callId}` → participants → offer(caller)/answer(callee) → ICE → CONNECTED. Filtra signaling por `callId`; offer única (evita glare por participants repetidos/reconnect).
- `call-cleanup.ts` (C.9): `createCallEpoch` (un callback de llamada vieja no altera la nueva) + `createIdempotentCleanup`.

## Store (`call-store.ts`) — contrato de conexión
- Al entrar en `CONNECTING` (accept / call-accepted) arranca el runtime inyectado (native en la app; doble en pruebas).
- **CONNECTED solo** cuando el runtime reporta `onConnected` (2 participantes + peer `connected` + audio remoto live). El cronómetro corre **desde `connectedAt`** (`joinedAt` eliminado).
- **Timeout de conexión 20 s** (C.7): sin CONNECTED → `FAILED(ice_timeout)` + `rtc:end` + cleanup.
- `onFailed(code)` (media/ICE/config) → `FAILED` + `rtc:end` + cleanup. Guard por `callId` (C.9): callbacks de una llamada vieja se ignoran.
- `toggleMute` → `setMicEnabled(!muted)`. Cleanup detiene runtime/tracks/timers en todo terminal (reject/cancel/timeout/remote-end/logout), **idempotente**.

## Deuda temporal del controller — reducida
`use-chat-controller.ts`: se **eliminó el `rtc:join` al abrir Chat** y `startCall` ahora **delega al store global** (sin peer/estado/timer local nuevo). Los listeners RTC legados quedan **inertes** (filtran por `roomId`, que ya nunca se setea) — su borrado final + el rewire del panel activo pertenecen al **Bloque D** (que reescribe la UI). No hay segundo `io()`, ni join automático, ni inicio de llamadas por el controller.

## Pruebas mobile (jest)
- `call-runtime.test.ts` (cores puros): ICE config (STUN/STUN+TURN/inválida/fallo, diagnóstico sanitizado); offerer canónico; cola ICE (encola/drena/ignora otro callId/reset); **CONNECTED exige las 4 condiciones** y ninguna señal por sí sola conecta; epoch/cleanup idempotente.
- `call-store.test.ts` (Bloque C, runtime doble): accept arranca runtime en CONNECTING sin conectar; `onConnected` → CONNECTED + `connectedAt`; timer no corre antes de `connectedAt`; **timeout 20s → FAILED(ice_timeout)+rtc:end**; `onFailed(ice_failed)`; mute/unmute; **callback de llamada vieja no conecta la nueva**; remote-end/logout detienen el runtime; doble reset idempotente; **abrir Chat no ejecuta rtc:join** (#20).

## Validación
- `npm run typecheck`: **PASS (exit 0)**.
- `jest` (módulo de llamadas): **43/43 PASS** (`call-machine` + `call-store` + `call-runtime`).
- backend `npm test`: **verde** (C.1).
- `assembleDebug`: __PENDIENTE_DE_RESULTADO__.

## Límite honesto
Los cores deterministas (C.4/C.5/C.6/C.9) están probados en jest. La **glue nativa** del runtime (getUserMedia/RTCPeerConnection/ICE reales) y el audio bidireccional se certifican en **dispositivo** (2 teléfonos: timbre global, 2 en cabina, audio, misma Wi-Fi y redes distintas) → `CALLS_RELEASE_BLOCKED`.

**Commit:** `fix(rtc): make peer negotiation and audio lifecycle deterministic`. **STOP para revisión** antes del Bloque D.
