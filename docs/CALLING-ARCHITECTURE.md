# Arquitectura del Sistema de Llamadas — ManeComb

> **Documento:** Arquitectura de Voz y Videollamadas
> **Versión:** 2.0 (rediseño del tamaño correcto)
> **Estado:** Diseño propuesto — pendiente de implementación
> **Reemplaza:** v1.0 (diseño de escala grande, rechazado — ver §13)

---

## 0. Contexto y alcance real

El sistema sirve a una **flotilla de decenas de unidades**, no a una plataforma de
videollamadas masiva. Las llamadas son **1 a 1** (chofer ↔ operador, u operador ↔
operador) sobre las conversaciones que ya existen en el chat. En un pico realista
hay unas pocas llamadas concurrentes, no miles.

Ese tamaño determina cada decisión de este documento. El diseño anterior (v1.0)
dimensionaba para "miles de usuarios" con un microservicio aparte, doble socket,
Redis y MongoDB nuevos. Nada de eso resuelve un problema que exista a esta escala;
solo agrega infraestructura que hay que desplegar, monitorear y mantener. Se
rechaza (§13).

**Este documento es de organización, no de reemplazo.** La mayor parte del sistema
ya está construida y verificada. El trabajo pendiente es (a) mover la lógica de
llamadas fuera del hook de chat, y (b) apoyarse en lo que el backend ya hace.

---

## Tabla de contenido

1. [Qué ya existe y se conserva](#1-qué-ya-existe-y-se-conserva)
2. [Arquitectura general](#2-arquitectura-general)
3. [Transporte y señalización — un solo socket](#3-transporte-y-señalización--un-solo-socket)
4. [Estado de la llamada — una sola fuente de verdad](#4-estado-de-la-llamada--una-sola-fuente-de-verdad)
5. [Extracción del "God Hook"](#5-extracción-del-god-hook)
6. [Detección de llamada huérfana](#6-detección-de-llamada-huérfana)
7. [Historial de llamadas (CDR)](#7-historial-de-llamadas-cdr)
8. [Foreground service (Android)](#8-foreground-service-android)
9. [TURN / ICE](#9-turn--ice)
10. [Logging proporcional](#10-logging-proporcional)
11. [Radio PTT — intacto](#11-radio-ptt--intacto)
12. [Futuro: grupales, pantalla, grabación](#12-futuro-grupales-pantalla-grabación)
13. [Rechazos respecto al diseño v1.0](#13-rechazos-respecto-al-diseño-v10)
14. [Auditoría crítica del diseño nuevo](#14-auditoría-crítica-del-diseño-nuevo)

---

## 1. Qué ya existe y se conserva

Verificado en código. Nada de esto se reescribe.

| Pieza | Ubicación | Estado |
|---|---|---|
| Foreground service Android (tipo dinámico micrófono / micrófono+cámara) | `mobile/android/.../calls/ManeCombCallService.kt`, `ManeCombCallModule.kt` | Construido, compila, en manifest mergeado. Sin verificar en dispositivo. |
| Ciclo de vida del servicio | `use-chat-controller.ts` — `useEffect` sobre `callSession` | Cubre todas las salidas (colgar, rechazo, timeout, cambio de chat, desmontaje). |
| Decisión sobre el ack de `rtc:join` | `mobile/src/screens/chat/utils/rtc-join-ack.ts` (+ test) | Función pura `{ok, reason}`, timeout 10s, guard por `callAttemptRef`. 6 tests. |
| Señalización backend | `backend/src/sockets/index.js:1105-1203` | `rtc:join`/`leave`/`offer`/`answer`/`ice-candidate`, sobre el socket general. Confirmada correcta. |
| Config STUN/TURN | `backend/src/services/rtc-config.js` | Arma STUN+TURN (REST HMAC o estática). Pendiente solo de desplegar coturn. |
| Persistencia de sesiones RTC (base del CDR) | `backend/src/data/store.js` — `createRtcSession`/`updateRtcSession`/`listRtcSessions`/`getRtcSessionById` | **Ya existe** a través de la capa `store`. |
| Detección de desconexión a media llamada | `backend/src/sockets/index.js:1221-1232` — timer de gracia 15s | **Ya existe**. Ver §6. |
| Wrapper JS del foreground service | `mobile/src/native/call-service.ts` | Tolera fallo sin tumbar la llamada. |
| Abstracción WebRTC multiplataforma | `mobile/src/native/webrtc.ts` | `isWebRTCAvailable()`, `mediaDevices`, `RTCPeerConnection`. |

---

## 2. Arquitectura general

Un solo backend, un solo socket, medios P2P directos entre dos participantes.

```
┌───────────────┐        señalización         ┌───────────────┐
│  Cliente A    │◄──── (Socket.IO general) ───►│  Cliente B    │
│ RN / Web      │                              │ RN / Web      │
│               │                              │               │
│ WebRTC peer   │◄═══ medios P2P (SRTP) ══════►│ WebRTC peer   │
└──────┬────────┘         │ si NAT lo impide   └───────┬───────┘
       │                  ▼                            │
       │           ┌─────────────┐                     │
       │           │ TURN (coturn│                     │
       │           │  VPS propio)│                     │
       │           └─────────────┘                     │
       │                                               │
       └──────────────► BACKEND ÚNICO ◄────────────────┘
              (Express + Socket.IO existente)
              · Auth/RBAC     · Chat · Radio · GPS
              · Señalización de llamadas (mismo socket)
              · store (embedded | mongo) → CDR
```

**Principios (a esta escala):**

| Principio | Qué significa aquí |
|---|---|
| Un backend | La señalización vive en el backend actual. Sin microservicio aparte. |
| Un socket | El socket general ya transporta la señalización bien. Sin segunda conexión. |
| P2P directo | Dos participantes → conexión directa. TURN solo cuando el NAT lo obliga. Sin SFU/mesh. |
| Una fuente de verdad | La máquina de estados vive en el cliente. El backend valida al entrar a la sala, no duplica la máquina. |
| Reusar el store | El CDR usa la misma capa de datos que notificaciones/incidentes. Sin Redis, sin Mongo nuevo. |
| Radio intacto | Llamadas y Radio PTT no comparten código ni ciclo de vida. |

---

## 3. Transporte y señalización — un solo socket

**Rechazo explícito del "Dual Socket Pattern" de v1.0.** El cliente mantiene **una**
conexión Socket.IO (`SOCKET_URL`), la misma que ya usan chat, radio, GPS y
presencia. No hay un problema real de aislamiento de carga a esta escala que
justifique una segunda conexión que autenticar, reconectar y monitorear por
separado.

Los eventos de señalización ya implementados y confirmados
(`backend/src/sockets/index.js`):

| Evento | Dirección | Rol |
|---|---|---|
| `rtc:join` | Cliente → Servidor (con **ack**) | Entrar a la sala. El ack devuelve `{ok:true}` o `{ok:false, reason:'busy'\|'forbidden'}`. |
| `rtc:leave` | Cliente → Servidor | Salir de la sala. |
| `rtc:offer` / `rtc:answer` | Peer → Peer (reenviado) | Intercambio SDP, dirigido por `targetSocketId`. |
| `rtc:ice-candidate` | Peer → Peer (reenviado) | Candidatos ICE. |
| `rtc:participants` | Servidor → Sala | Lista de participantes al entrar/salir. |
| `rtc:hangup` | Servidor → Sala | Un peer colgó (lo emite `leaveRtcRoom`). |

**Capas de transporte:**

| Capa | Protocolo | Uso |
|---|---|---|
| Señalización | WebSocket (Socket.IO) | Control de la llamada. |
| Medios | SRTP (WebRTC) | Audio y video, P2P. |
| NAT traversal | STUN / TURN | Solo si el P2P directo falla. |
| REST | HTTPS | Config ICE (`GET /rtc/config`), historial de llamadas. |

**Máquina de estados: solo en el cliente.** El backend no necesita una máquina de
estados formal. Ya resuelve `busy`/`forbidden` con una comprobación simple al
entrar a la sala (`members.size >= 2` → `busy`; validación de permisos →
`forbidden`, `index.js:1111-1141`). No se duplica esa lógica como una máquina de
estados servidor + cliente.

---

## 4. Estado de la llamada — una sola fuente de verdad

La máquina de estados vive en el cliente, apoyada en `rtc-join-ack.ts` (ya existe
como base de decisión). El backend no la replica.

```
        IDLE
         │ startCall
         ▼
      CALLING ──ack busy/forbidden──► (aviso) ──► IDLE
         │ ack ok
         ▼
     CONNECTING ──ICE failed──► FAILED ──► IDLE
         │ onconnected
         ▼
     CONNECTED ──colgar/leave/hangup──► ENDED ──► IDLE
         │ ICE disconnected
         ▼
    RECONNECTING ──recuperado──► CONNECTED
                 └──grace vencido──► FAILED
```

| Estado | Significado |
|---|---|
| `idle` | Sin llamada. |
| `calling` | Se emitió `rtc:join`, esperando ack / respuesta del peer. |
| `connecting` | Handshake WebRTC (SDP + ICE) en curso. |
| `connected` | Medios fluyendo. |
| `reconnecting` | ICE perdido, en periodo de gracia. |
| `failed` | No se pudo establecer o se perdió irrecuperablemente. |
| `ended` | Finalizada normalmente. |

Los avisos al usuario (`busy`, `forbidden`, timeout, sin respuesta) se muestran
reutilizando el componente `callNotice` que ya existe — no se crea UI nueva.

---

## 5. Extracción del "God Hook"

**El único cambio estructural grande de este ticket, y es de mantenibilidad, no de
escala.** `use-chat-controller.ts` tiene ~1505 líneas y mezcla chat de texto con
toda la lógica de llamadas (~389 líneas tocan `rtc`/`call`/`peer`/`ice`).

Se extrae a un módulo dedicado — `use-call-controller.ts` — dejando
`use-chat-controller.ts` solo con chat de texto.

**Qué se mueve (todo ya existe, solo cambia de archivo):**

- Estado y refs: `callSession`, `peerRef`, `localStreamRef`, `joinedRtcRoomRef`,
  `isStartingCallRef`, `callAttemptRef`, `closeActiveCallRef`, `obtainLocalMediaRef`.
- Lógica: `startCall` (con el ack de `rtc:join` y el guard de `callAttemptRef`),
  `closeActiveCall`, `obtainLocalMedia`, los handlers `rtc:*`, el `useEffect` del
  foreground service.
- Dependencias ya escritas: `rtc-join-ack.ts`, `call-service.ts`, `webrtc.ts`.

**Contrato de salida** (lo que el hook de chat consume):

```typescript
// use-call-controller.ts
type CallController = {
  callSession: CallSession | null
  callNotice: string | null
  startCall: (mode: CallMode) => void
  closeActiveCall: (options?: { reason?: string | null }) => Promise<void>
  toggleMute: () => void
  toggleCamera: () => void
  // participantes, timer, etc. según lo que la UI ya usa
}
```

El socket se comparte: `use-call-controller` recibe la referencia al socket ya
conectado (no abre uno nuevo). El chat sigue siendo dueño de la conexión; las
llamadas la usan.

**Regla:** el hook de chat no vuelve a tocar `RTCPeerConnection`, `getUserMedia`
ni eventos `rtc:*` directamente. Solo invoca el `CallController`.

**Límite honesto:** esta extracción es un refactor de superficie amplia sobre
código sin tests de integración de chat. La corrección se verifica en el ticket de
implementación (typecheck + prueba de una llamada real), no aquí.

---

## 6. Detección de llamada huérfana

**No hace falta un protocolo de heartbeat custom. Ya está resuelto por los eventos
nativos de Socket.IO.**

Verificado en `backend/src/sockets/index.js:1221-1232`: cuando un socket se
desconecta a mitad de una llamada, el servidor arma un **timer de gracia de 15s**
(`rtcDisconnectTimers`). Si el socket no vuelve a entrar a la sala dentro de esa
ventana, se ejecuta `leaveRtcRoom` → `finishRtcSession(roomId, "completed")`
(`index.js:340-362`), que difunde `rtc:hangup` al otro participante y cierra la
sesión. Si el socket reconecta y re-emite `rtc:join` antes de los 15s, el timer se
cancela (`index.js:1129-1133`) y la llamada continúa.

Esto cubre el caso real ("el otro lado se cayó a media llamada") sin protocolo
adicional. El diseño v1.0 proponía heartbeats de presencia cada 15s con intervalos
configurables — eso resuelve un problema de escala que aquí no existe.

**Único hueco pendiente (menor, para el ticket de implementación):** confirmar en
el cliente que el `connectionstatechange === 'disconnected'` del propio
`RTCPeerConnection` transiciona la UI a `reconnecting` y, si no recupera, a
`failed` — para que el usuario que **sigue conectado al socket** pero perdió el
peer también vea el cierre. El socket cubre la caída de red total; el estado del
peer cubre la caída solo-de-medios. Ambos ya tienen las señales; falta cablear la
del peer a la UI. Sin heartbeat nuevo.

---

## 7. Historial de llamadas (CDR)

**Reusa la persistencia que ya existe. Sin Redis, sin colección Mongo nueva, sin
write-behind.**

Verificado: la capa `store` (`backend/src/data/store.js`) ya expone
`createRtcSession`, `updateRtcSession`, `listRtcSessions` y `getRtcSessionById`, y
ya se usan desde la señalización (`ensureRtcSession`/`syncRtcSession`/
`finishRtcSession` en el socket). Esta es **la misma capa** que usan notificaciones,
incidentes y `appEvents`.

La capa `store` tiene dos implementaciones seleccionadas en runtime
(`server.js:39`): `createEmbeddedStore()` (en memoria) cuando no hay Mongo, y
`createMongoStore()` cuando `db.connected`. El CDR de llamadas **hereda esa misma
selección automáticamente** — no elige tecnología, usa la que el resto del backend
ya tiene configurada.

**Trabajo pendiente (incremental sobre lo existente):**

1. Confirmar qué campos guarda hoy `createRtcSession`/`updateRtcSession` y
   completar lo que falte para un CDR útil: `roomId`, `organizationId`,
   participantes, `mode` (audio/video), `startedAt`, `answeredAt`, `endedAt`,
   `durationSeconds`, `reason` (normal/timeout/rejected/busy/failed).
2. Asegurar que `finishRtcSession` escribe `reason` y `durationSeconds` reales.
3. Endpoint REST de lectura para el historial por conversación, siguiendo el patrón
   de las rutas existentes (paginación por cursor como el chat, si aplica).

No hay capa de "observabilidad de llamadas" nueva ni doble almacenamiento.

---

## 8. Foreground service (Android)

Ya construido (§1). `ManeCombCallService.kt` arranca `startForeground()` con
`foregroundServiceType` dinámico: `MICROPHONE` en audio, `MICROPHONE | CAMERA` en
video. Notificación persistente `CATEGORY_CALL`. El manifest declara el servicio
con `microphone|camera` y los permisos `FOREGROUND_SERVICE_MICROPHONE/CAMERA`.

El ciclo de vida cuelga de un `useEffect` sobre `callSession`, de modo que toda
salida de la llamada detiene el servicio. Al extraer el hook (§5), ese `useEffect`
se mueve a `use-call-controller.ts` sin cambios de lógica.

Pendiente: verificación en dispositivo real (iniciar llamada, mandar app a segundo
plano / bloquear pantalla, confirmar que el audio/video sigue vivo). Es una prueba
de dispositivo, no de diseño.

---

## 9. TURN / ICE

`rtc-config.js` ya arma STUN + TURN. A esta escala basta **un** coturn en VPS
propio (decisión de infraestructura ya tomada). Variables que el backend espera
(`env.js:241-252`, rama REST en `rtc-config.js:12`):

- `TURN_URLS` (coma-separadas), `TURN_SECRET`, `TURN_REALM` — las tres
  obligatorias para la rama REST; si falta una, cae en silencio a `stun_only`.
- `TURN_CREDENTIAL_TTL_SECONDS` — opcional (default 3600).

El backend genera credenciales HMAC-SHA1 `<expiry>:<userId>` (esquema REST estándar
de coturn). Verificación: `GET /rtc/config` debe devolver `turnEnabled: true` y
`credentialMode: "coturn_rest"`. No se dimensiona DNS round-robin ni múltiples
servidores TURN — un coturn es suficiente para la flotilla.

---

## 10. Logging proporcional

Se usa el mismo logger estructurado del backend (`action`/`module`/`status`/
`metadata`), igual de detallado que hoy — **no** una capa de observabilidad nueva,
ni Prometheus dedicado a llamadas, ni tracing distribuido propio.

Eventos que vale la pena registrar (al nivel que el resto del backend ya usa):

| Evento | Nivel |
|---|---|
| Llamada iniciada / aceptada / finalizada | info |
| Fallo de establecimiento / ICE | warn |
| Timeout / rechazo / busy | info/warn |
| Fallo al persistir CDR | error |

La señalización ya emite `observeSocketEvent(...)` por cada evento `rtc:*`
(`index.js`), que alimenta las métricas existentes. Eso se conserva; no se agrega
otra capa encima.

---

## 11. Radio PTT — intacto

Radio PTT no se toca ni se reutiliza. Llamadas y Radio son subsistemas separados:
distinto ciclo de vida, distinto foreground service (`ManeCombRadioService` con
`mediaPlayback` vs `ManeCombCallService` con `microphone|camera`), distinto
transporte de audio. Esta restricción se hereda sin cambios del diseño v1.0.

---

## 12. Futuro: grupales, pantalla, grabación

**No ahora.** El modelo P2P 1-a-1 cubre el tamaño real. Si en el futuro aparece una
necesidad concreta:

- **Llamadas grupales (3+):** requerirían un SFU (p. ej. mediasoup). Es un cambio
  de arquitectura de medios, no una extensión. Se evalúa cuando exista el caso, no
  antes.
- **Compartir pantalla:** `getDisplayMedia()` (web) / API nativa (mobile) como
  pista adicional. Extensible sobre el mismo peer 1-a-1.
- **Grabación:** implicaría relay de medios por el servidor (hoy los medios son
  P2P y no pasan por el backend). Cambio grande; fuera de alcance.

Ninguna de estas se diseña a fondo aquí. El diseño actual no se cierra a ellas,
pero tampoco paga su complejidad por adelantado.

---

## 13. Rechazos respecto al diseño v1.0

Rastro de decisión: qué se quitó del documento anterior y por qué.

| Rechazado en v1.0 | Motivo |
|---|---|
| Microservicio "Call Signal Service" aparte (Docker, package.json propio) | No hay volumen que justifique un proceso que desplegar/monitorear por separado. La señalización se queda en el backend actual. |
| Dual Socket Pattern (dos conexiones Socket.IO) | El socket general ya transporta la señalización bien. Duplicar la conexión no resuelve un problema real. |
| Redis (state, locks, pub/sub, adapter) | Sin multi-instancia a esta escala; el estado de sala vive en memoria del proceso y el CDR en el `store` existente. |
| MongoDB nuevo / colección `calls` dedicada | El CDR reusa `createRtcSession`/`updateRtcSession` del `store` actual, que ya elige embedded o mongo según el despliegue. |
| Diseño "SFU-first" / mesh (mediasoup, simulcast) | P2P 1-a-1 basta para la flotilla. El SFU se evalúa solo si aparecen llamadas grupales. |
| Máquina de estados formal duplicada cliente + servidor | El servidor resuelve `busy`/`forbidden` con una comprobación al entrar a la sala. La máquina de estados vive solo en el cliente. |
| Heartbeat de presencia de llamada cada 15s configurable | El timer de gracia de 15s en `disconnect` (ya existente) cubre la llamada huérfana sin protocolo nuevo. |
| Capa de observabilidad dedicada (Prometheus de llamadas, tracing propio, health/ready del microservicio) | Logging proporcional sobre el logger y las métricas que el backend ya tiene. |
| Librerías compartidas `@manecomb/calling-*` publicadas | Tipos y constantes en un módulo local; no hay múltiples servicios que compartan un paquete versionado. |
| JWT re-emitido con `iss: manecomb-calling` | La señalización va por el socket ya autenticado; no hay un segundo servicio que valide tokens aparte. |

---

## 14. Auditoría crítica del diseño nuevo

Una auditoría en papel no reemplaza la verificación contra código, que va en el
ticket de implementación. Riesgos y puntos débiles honestos de **este** diseño:

1. **Estado de sala en memoria del proceso.** `rtcRooms`/`rtcDisconnectTimers` viven
   en el proceso. Si el backend se reinicia a mitad de una llamada, la señalización
   de esa llamada se pierde (los medios P2P podrían sobrevivir un rato, pero
   colgar/reconectar por señalización no). **A esta escala es aceptable** (reinicios
   raros, llamadas cortas), y es exactamente el trade-off que evita Redis. Se asume
   conscientemente, no se ignora.

2. **Un solo backend = un punto de fallo para señalización.** Si el backend cae, no
   hay llamadas nuevas. Es el mismo punto de fallo que ya tiene chat/radio/GPS, así
   que no introduce una fragilidad nueva. Aceptado.

3. **El refactor del "God Hook" (§5) es el mayor riesgo de regresión.** Mover ~389
   líneas de un archivo de 1505 sin tests de integración de chat puede romper
   interacciones sutiles (orden de handlers, cierres sobre refs, timing del
   `useEffect` del foreground service). Mitigación: extracción mecánica (mismo
   código, otro archivo), typecheck estricto, y una prueba de llamada real antes de
   cerrar. **No se debe dar por bueno solo porque compila.**

4. **`use-call-controller` comparte el socket con el chat.** Si el chat cambia cómo
   gestiona la conexión, las llamadas se ven afectadas. Es el precio de un solo
   socket (que es la decisión correcta). El contrato de §5 debe dejar claro que el
   chat es dueño de la conexión y las llamadas la consumen.

5. **CDR depende de que `finishRtcSession` escriba datos reales.** Hoy existe la
   función, pero hay que confirmar (no asumir) que `reason` y `durationSeconds`
   reflejan la realidad en todas las vías de cierre (colgar, timeout de gracia,
   rechazo). Un CDR con `reason` siempre `"completed"` sería inútil.

6. **La reconexión solo-de-medios (§6) aún no está cableada a la UI.** El socket
   cubre la caída total; el `connectionstatechange` del peer cubre la caída de
   medios con socket vivo. La señal existe pero falta conectarla. Riesgo bajo, pero
   real hasta que se implemente.

7. **Verificación de dispositivo pendiente para el foreground service (§8) y para
   TURN entre redes distintas (§9).** Nada de esto se puede certificar desde el
   código. Hasta que ambos estén probados en dispositivo, una llamada fallida entre
   dos choferes no distingue entre bug de código y falta de infraestructura.

**Conclusión:** el diseño es del tamaño del problema. El trabajo real pendiente es
el refactor de extracción (§5) y completar el CDR (§7) sobre piezas que ya existen
y están verificadas — no construir infraestructura nueva. La certificación final es
por prueba en dispositivo, no por este documento.
