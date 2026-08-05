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
