# ManeComb — Mapa de autoridad del sistema

Una responsabilidad, una autoridad. Este documento responde "¿quién produce este
hecho?" para el estado operativo de ManeComb, y sirve de contrato para no volver
a introducir dos productores del mismo hecho.

Complementa, no sustituye:

- `architecture/decisions/ADR-001-product-boundaries-and-authorities.md` — límites de producto
- `architecture/PHASE-0-SYSTEM-INVENTORY-20260806.md` — inventario
- `architecture/PHASE-1-AUTH-ACCOUNT-CHANNEL-AUDIT-20260806.md` — auth y canal de cuenta
- `architecture/PHASE-2-TENANT-CAPABILITIES-AUDIT-20260806.md` — tenant y capacidades
- `radio-ssot-audit/RADIO_PRO_ARCHITECTURE.md` — Radio en detalle

Estado del árbol: rama `feat/radio-pro-evolution`.

---

## 1. Matriz de autoridad

| Hecho | Productor único | Persistencia | Consumidores |
|---|---|---|---|
| usuario autenticado | `root-store` (`user`), poblado por login/session | SecureStore (token) | toda la app |
| token de sesión | `root-store` (`token`) | SecureStore | API, socket JS, Radio nativo |
| organización activa | backend, derivada del token (`getOrganizationId`) | JWT + backend | todo dato multi-tenant |
| canal de cuenta / acceso | backend (`authContext`, `canAccessMobile`) | backend | navegación, gates |
| autorización | **backend** (middlewares + `canUseOperationalFeatures`) | backend | todos los endpoints y eventos |
| navegación por rol | `canRoleAccessRoute` (`navigation/router`) | — | router |
| socket realtime compartido | `root-store.connectSocket` | — | Chat, Presencia, Llamadas, GPS, entidades |
| presencia | backend (`presence:*`) → `root-store` | backend | UI |
| ubicación del vehículo | `use-location-engine` (JS) **o** `ManeCombLocationService` (nativo), nunca ambos | backend | mapa, admin |
| jornada activa | backend (`operational-unit` / `journey`) → `root-store` | backend | driver, mapa, admin |
| sesión de ruta | backend (`route-session:updated`) → `root-store` | backend | mapa, checklist |
| mensajes de chat | `root-store.messagesByConversation`, dedup por `message.id` | backend | Chat, Audios de Radio |
| llamada activa | `call-store` (máquina propia) | — | overlay, Radio (preempción) |
| sesión de Radio | `ManeCombRadioService` (nativo) → proyectada a `radio-live-store` | — | pantalla Radio, overlay |
| notificaciones | backend (`notification-delivery`) | backend | app |
| documentos | backend | backend | driver, admin |
| incidentes | backend (`incident:*`) → `root-store` | backend | control |

Ninguna fila tiene dos productores finales.

---

## 2. Mapa realtime

| Transporte | Propietario | Alcance | Justificación |
|---|---|---|---|
| socket JS compartido | `root-store.connectSocket` | Chat, Presencia, Llamadas (signaling), GPS, entidades | una conexión por sesión; `connectSocket` es idempotente por `socketSessionKey` |
| socket nativo de Radio | `SocketIoRadioTransport` (Kotlin) | solo `radio:*` | el camino crítico del audio no puede depender de que el runtime JS esté vivo |
| socket one-shot de acciones de llamada | `call-action-headless-task` | solo `rtc:reject` | corre en contexto headless, sin app viva; `forceNew`, sin reconexión, `disconnect()` en `finally` |
| socket de ventas | `ventas/src/store/use-app-store` | aplicación web separada | otro producto, otro proceso |

**Regla**: ningún módulo emite ni escucha `radio:*` desde JavaScript. Verificado
por `radio-transport-ownership.test.js`.

### Ciclo de vida de listeners

- `root-store`: registra sus ~20 listeners una sola vez por socket; al cambiar de
  sesión destruye el socket completo antes de crear otro. No hay acumulación.
- `call-runtime`: registra 7 listeners y los retira uno a uno con
  `socket.off(evento, handler)` mediante `createIdempotentCleanup`. Nunca usa
  `removeAllListeners` sobre un socket compartido vivo.
- `call-store.bindSocket`: idempotente por instancia; desengancha antes de
  reenganchar cuando el socket es reemplazado.

---

## 3. Matriz de recursos de audio y captura

El micrófono es exclusivo del proceso. `RadioAudioSession` es el árbitro, porque
ya es la autoridad de quién posee el audio.

| Recurso | Llamadas | Radio | Notas de voz (Chat) | Historial de Radio |
|---|---|---|---|---|
| micrófono | WebRTC `getUserMedia` | `AudioRecord` | `MediaRecorder` | — |
| árbitro | `setRadioCallActive` → Radio cede | `RadioAudioSession` | `beginExternalCapture()` | — |
| altavoz | WebRTC | `AudioTrack` (`RadioAudioRoute`) | — | `MediaPlayer` |
| AudioFocus | WebRTC | `RadioAudioSession` | — | `ManeCombAudioModule` |
| cámara | WebRTC | — | — | — |
| foreground service | `ManeCombCallService` (`microphone\|camera`) | `ManeCombRadioService` (`mediaPlayback\|microphone`) | — | — |

Exclusiones garantizadas:

- Llamada activa → Radio pasa a `PAUSED_BY_CALL` y libera micrófono y canal.
- Radio transmitiendo/recibiendo → historial y notas de voz rechazados con
  `radio_channel_active`.
- Nota de voz grabando → `RadioAudioSession.startCapture()` rechaza con
  `microphone_busy`.

Verificado por `audio-resource-matrix.test.js`.

---

## 4. Servicios en segundo plano

| Servicio | Propietario | Arranque | Parada | Credenciales |
|---|---|---|---|---|
| `ManeCombLocationService` | `use-location-engine` (owner `operational-runtime`) | jornada operativa con vehículo | pierde condiciones o logout | `ManeCombSecureStore`, alias GPS |
| `ManeCombRadioService` | `radio-live-overlay` → módulo nativo | sesión elegible + canal | logout / `deactivate()` | solo en memoria |
| `ManeCombCallService` | `call-overlay` | llamada conectando/conectada | fin de llamada | — |

Ninguna pantalla inicia o detiene un servicio nativo por montarse. Verificado por
`background-location-authority.test.js` y `radio-transport-ownership.test.js`.

---

## 5. Cadena de ciclo de vida de sesión

```text
login
 → root-store.user + token           (autoridad de identidad)
 → connectSocket                     (socket compartido)
 → authContext                       (canal de acceso)
 → use-location-engine               (GPS según jornada real)
 → radio-live-overlay                (sesión nativa de Radio)
 → call-overlay                      (signaling de llamadas)

logout
 → hardResetBackgroundLocationServiceAsync   (antes del logout remoto)
 → radio deactivate                          (socket, canal, audio, identidad)
 → call reset + foreground service off
 → disconnectSocket
 → limpieza de token
```

El orden importa: GPS se detiene **antes** de esperar al logout remoto, para que
una red lenta no deje el servicio publicando posiciones de una sesión cerrada.
Verificado por `background-location-authority.test.js`.
