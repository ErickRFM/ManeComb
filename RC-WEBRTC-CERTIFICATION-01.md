# RC-WEBRTC-CERTIFICATION-01 — Auditoría Integral de Llamadas y Videollamadas

## 1. Arquitectura Auditada

### Archivos que componen el sistema WebRTC

| Archivo | Rol |
|---------|-----|
| `mobile/src/screens/chat/hooks/use-chat-controller.ts` | Controlador principal — contiene todo el signaling WebRTC, peer connection, media management |
| `mobile/src/screens/chat/types.ts` | Tipos `CallSession`, `CallPhase`, `CallMode`, `RtcParticipant` |
| `mobile/src/screens/chat/components/chat-screen-view.tsx` | UI de llamada activa (callHub, controles mute/cámara/colgar) |
| `mobile/src/screens/chat/components/message-media.tsx` | Componente `CallMediaTile` para video remoto/local |

### Dependencias externas

- `socket.io-client` — Signaling socket (conexión independiente al backend)
- `@/src/api/client` (`getRtcIceConfigRequest`) — Obtiene configuración STUN/TURN
- WebRTC API nativa (`RTCPeerConnection`, `MediaStream`, `RTCSessionDescription`, `RTCIceCandidate`)

---

## 2. Flujo Completo de Llamadas y Videollamadas

### Diagrama lógico

```
Usuario A                          Socket.IO Servidor              Usuario B
   |                                     |                             |
   |   (NUNCA se emite rtc:join          |                             |
   |    al abrir una conversación)       |                             |
   |                                     |                             |
   |  ─── Falta: rtc:join ──────────────>                             |
   |                                     |  ─── rtc:join ────────────> |
   |                                     |                             |
   |  <── rtc:participants ───────────── |                             |
   |                                     |                             |
   |  (localeCompare decide quién        |                             |
   |   inicia la oferta)                 |                             |
   |                                     |                             |
   |  ─── rtc:offer ────────────────────>                               |
   |                                     |  ─── rtc:offer ────────────> |
   |                                     |                             |
   |                                     |  <── rtc:answer ──────────── |
   |  <── rtc:answer ─────────────────── |                             |
   |                                     |                             |
   |  ─── rtc:ice-candidate ────────────>                               |
   |  <── rtc:ice-candidate ──────────── |                             |
   |                                     |                             |
   |  ─── rtc:leave ────────────────────>                               |
```

### Flujo detallado

1. **Socket creation** (solo web): `io(SOCKET_URL, { auth: { token } })` — línea 120
2. **ICE Config**: `getRtcIceConfigRequest()` fetch asíncrono — línea 130
3. **rtc:participants handler**: Cuando llega la lista de participantes, el que tiene menor socket ID crea una oferta WebRTC
4. **buildPeerConnection**: Crea `RTCPeerConnection`, añade tracks locales, configura `onicecandidate`, `ontrack`, `onconnectionstatechange`
5. **rtc:offer/rtc:answer**: Intercambio de SDP
6. **rtc:ice-candidate**: Intercambio de ICE candidates (con queue de candidatos pendientes)
7. **rtc:hangup**: Limpieza completa cuando el otro cuelga
8. **disconnect/reconnect**: Manejo de reconexión del socket

---

## 3. Auditoría de Señalización (Socket.IO y WebRTC)

### Eventos implementados

| Evento | ¿Existe? | ¿Emitter? | ¿Listener? | Payload |
|--------|----------|-----------|------------|---------|
| `rtc:join` | ❌ Nunca se emite al entrar | Solo en reconnect/failure | ❌ Sin listener | `{ roomId }` / `{ roomId, userId, name }` |
| `rtc:participants` | ✅ | Servidor | ✅ Línea 234 | `{ participants: RtcParticipant[], roomId }` |
| `rtc:offer` | ✅ | Cliente (línea 281) | ✅ Línea 302 | `{ offer, roomId, targetSocketId, mode, initiatedBy, userId }` |
| `rtc:answer` | ✅ | Cliente (línea 329) | ✅ Línea 348 | `{ answer, roomId, targetSocketId, mode }` |
| `rtc:ice-candidate` | ✅ | Cliente (línea 169) | ✅ Línea 367 | `{ candidate, roomId, targetSocketId }` |
| `rtc:hangup` | ❌ Nunca se emite | Servidor | ✅ Línea 385 | `{ roomId }` |
| `rtc:leave` | ✅ | Cliente (líneas 390, 829, 1097) | ❌ Sin listener | `{ roomId }` |
| `rtc:call` | ❌ No existe | — | — | — |
| `rtc:ringing` | ❌ No existe | — | — | — |
| `rtc:renegotiate` | ❌ No existe | — | — | — |
| `rtc:busy` | ❌ No existe | — | — | — |
| `rtc:reject` | ❌ No existe | — | — | — |
| `rtc:timeout` | ❌ No existe | — | — | — |

### Hallazgos críticos de señalización

1. **Falta `rtc:join` al entrar a una conversación**: El cliente nunca emite `rtc:join` cuando el usuario selecciona o abre una conversación. Sin esto, el servidor no agrega al usuario a la sala WebRTC y nunca recibe `rtc:participants`. El `rtc:join` solo se emite en reconexión del socket (línea 421) y cuando la peer connection falla (línea 225).

2. **No hay protocolo de llamada**: No existen eventos `rtc:call`, `rtc:ringing`, `rtc:busy`, `rtc:reject`, `rtc:timeout`. El sistema asume que ambos usuarios están siempre listos para aceptar una llamada. No hay timbre, no hay "ocupado", no hay "rechazar".

3. **No hay botón para iniciar llamada**: No existe un handler `startCall` o `startVideoCall`. La llamada se inicia automáticamente cuando ambos usuarios están en la misma sala (determinado por `localeCompare` del socket ID). No hay consentimiento del usuario.

4. **`rtc:hangup` solo del servidor**: El cliente no emite `rtc:hangup` cuando el usuario local cuelga. En su lugar, emite `rtc:leave` (línea 829). El servidor debe emitir `rtc:hangup` al otro participante.

5. **Eventos sin listener**: `rtc:leave` se emite pero no tiene listener del lado del cliente. Esto significa que cuando un usuario se va, el otro no recibe notificación.

---

## 4. Estados de la Llamada

### Estados definidos (`CallPhase` en types.ts)

```typescript
export type CallPhase = 'waiting' | 'connecting' | 'connected' | 'reconnecting';
```

### Estados faltantes según requerimiento

| Estado Requerido | ¿Existe? | Nota |
|------------------|----------|------|
| Idle | ❌ | No hay estado idle — `callSession` es `null` cuando no hay llamada |
| Calling | ❌ | No existe — nunca se inicia una llamada explícitamente |
| Ringing | ❌ | No existe — no hay timbre |
| Connecting | ✅ | Se asigna al crear oferta/responder |
| Connected | ✅ | Se asigna en `ontrack` y `onconnectionstatechange === 'connected'` |
| Reconnecting | ✅ | Se asigna en `disconnected`, `failed`, y socket `disconnect` |
| On Hold | ❌ | No existe |
| Ended | ❌ | `callSession` se setea a `null` |
| Failed | ❌ | No hay estado failed explícito |
| Busy | ❌ | No existe |
| Rejected | ❌ | No existe |
| Timeout | ✅ | Timeout de 30s en `waiting`, 15s en `reconnecting` (línea 1083) |

### Transiciones actuales

```
null → waiting (rtc:participants, sin otros)
null → connecting (rtc:participants, con otros — crea offer)
null → connecting (rtc:offer — crea answer)
connecting → connected (ontrack / connectionstatechange)
connected → reconnecting (socket disconnect / peer disconnected / peer failed)
reconnecting → connected (socket reconnect)
waiting → null (timeout 30s)
reconnecting → null (timeout 15s)
cualquiera → null (rtc:hangup, closeActiveCall, cambio de conversación)
```

### Transiciones inválidas detectadas

- `peer.onconnectionstatechange === 'failed'` → setea `phase: 'reconnecting'` y emite `rtc:join` (línea 218-226). Esto debería setear `phase: 'failed'` en lugar de 'reconnecting', o al menos intentar un número limitado de reconexiones.
- No hay límite de reintentos de reconexión.

---

## 5. Recursos (PeerConnection, MediaStreams, Listeners)

### PeerConnection

| Aspecto | Estado | Evidencia |
|---------|--------|-----------|
| Se crea correctamente | ✅ | `buildPeerConnection()` línea 146 |
| Se destruye al colgar | ✅ | `closeActiveCall()` línea 832 |
| Se destruye en cleanup | ✅ | Effect cleanup línea 432 |
| Se destruye en disconnect | ✅ | Línea 407 |
| Se destruye en hangup remoto | ✅ | Línea 391 |
| Se destruye al cambiar chat | ✅ | Línea 1100 |
| Se destruye en failed | ✅ | Línea 219 (resetea) |
| Se destruye antes de crear nueva | ✅ | `buildPeerConnection` llama `resetPeerConnection(false)` línea 151 |
| `onicecandidate` se limpia | ✅ | Línea 138 |
| `ontrack` se limpia | ✅ | Línea 139 |
| `onconnectionstatechange` se limpia | ✅ | Línea 140 |

### MediaStreams (audio/video local)

| Aspecto | Estado | Evidencia |
|---------|--------|-----------|
| Se obtiene correctamente | ❌ | **Nunca se obtiene `getUserMedia`** — no hay llamada a `mediaDevices.getUserMedia` para WebRTC |
| Tracks se detienen al colgar | ✅ | `stopLocalCallTracks()` línea 815-818 |
| Tracks se detienen en hangup remoto | ✅ | Línea 392 |
| Tracks se detienen en cleanup | ✅ | Línea 433 |
| Tracks se detienen al cambiar chat | ✅ | Línea 1102 |
| `localStreamRef` se limpia | ✅ | En todos los casos anteriores |
| `isCallMuted` se resetea | ✅ | En todos los casos de finalización |
| `isCameraEnabled` se resetea | ✅ | En todos los casos de finalización |

### Hallazgo crítico: No hay `getUserMedia`

**El `localStreamRef.current` NUNCA se inicializa.** No hay ninguna llamada a `navigator.mediaDevices.getUserMedia()` para WebRTC en todo el archivo. El código que crea la peer connection (línea 158-162) itera sobre `localStream.getTracks()`, pero `localStream` es `localStreamRef.current` que siempre es `null`.

Consecuencia:
- `buildPeerConnection` crea una `RTCPeerConnection` sin tracks locales
- El otro lado recibe `ontrack` SIN streams locales de quien inició
- `localStreamRef.current?.getAudioTracks()` en `toggleCallMute` es siempre null → mute no funciona
- `localStreamRef.current?.getVideoTracks()` en `toggleCamera` es siempre null → cámara no funciona

### Socket Listeners

| Aspecto | Estado | Evidencia |
|---------|--------|-----------|
| Listeners se registran | ✅ | Líneas 233-427 |
| Listeners se limpian en cleanup | ✅ | `socket.removeAllListeners()` línea 444 |
| Listeners se limpian en disconnect | ❌ | Solo `resetPeerConnection()` línea 407, no `removeAllListeners()` |
| Listeners duplicados | ❌ **POSIBLE** | Como el socket se crea en un `useEffect` con `[token, user]` como deps, si cambian, se crea un nuevo socket y el viejo se desconecta. Pero si hay un error en el cleanup, pueden existir sockets duplicados. |

### Timers

| Timer | Inicio | Limpieza |
|-------|--------|----------|
| `callTimerRef` (temporizador de llamada) | `syncCallTimer()` — setInterval 1s | `stopCallTimer()` — clearInterval en hangup, cleanup, cambio chat |
| Timeout de waiting (30s) | `useEffect` línea 1076 | `clearTimeout` en cleanup del mismo effect |
| Timeout de reconnecting (15s) | `useEffect` línea 1076 | `clearTimeout` en cleanup del mismo effect |

---

## 6. Audio

| Aspecto | Estado | Nota |
|---------|--------|------|
| Permisos de micrófono | ❌ **No se solicitan** | No hay `getUserMedia` para WebRTC |
| Micrófono en llamada | ❌ | No hay tracks locales |
| Mute/Unmute | ❌ | `toggleCallMute` itera sobre `localStreamRef.current?.getAudioTracks()` que siempre está vacío |
| Altavoz/Auricular/Bluetooth | ❌ | No implementado para WebRTC |
| Pérdida de audio | ❌ | No aplica — nunca hay audio |
| Recuperación | ❌ | No aplica |
| Micrófono bloqueado | ❌ **RIESGO** | Sin `getUserMedia`, no hay riesgo de bloqueo. Pero si se agrega en el futuro, debe asegurarse que se libere correctamente. |

---

## 7. Video

| Aspecto | Estado | Nota |
|---------|--------|------|
| Cámara frontal/trasera | ❌ | No hay `getUserMedia` |
| Activar/desactivar video | ❌ | `toggleCamera` itera sobre tracks vacíos |
| Permisos de cámara | ❌ | No se solicitan |
| Vista local | ❌ | `localStreamRef.current` es siempre null |
| Vista remota | ❌ | `event.streams[0]` en `ontrack` — el remoto envía stream, pero el local nunca recibe porque no hay oferta con tracks |

---

## 8. ICE, STUN, TURN

| Aspecto | Estado | Evidencia |
|---------|--------|-----------|
| ICE Servers config | ✅ | Se obtienen de `getRtcIceConfigRequest()` línea 130 |
| STUN por defecto | ✅ | Fallback: `stun:stun.l.google.com:19302` línea 110 |
| TURN (si configurado) | ✅ | Según respuesta del servidor |
| ICE Candidates queue | ✅ | `pendingIceCandidatesRef` línea 104, con límite de 128 |
| Candidates duplicados | ⚠️ **POSIBLE** | No hay deduplicación de candidates — el queue se procesa con `splice(0)` y se filtran por `fromSocketId` |
| Timeout de ICE | ❌ | No hay timeout explícito para ICE — se delega al timeout general de reconexión |

---

## 9. Reconexión

| Escenario | Estado | Evidencia |
|-----------|--------|-----------|
| Socket disconnect → reconnect | ✅ | Líneas 415-427: re-emite `rtc:join` |
| Peer disconnected | ✅ | Línea 208-215: setea `phase: 'reconnecting'` |
| Peer failed | ✅ | Línea 218-226: resetea peer, emite `rtc:join` |
| Timeout en reconnecting (15s) | ✅ | Línea 1083 |
| Cambio de red (WiFi → datos) | ⚠️ | Depende de socket.io-client — `reconnection: true`, delay 800ms |
| Límite de reintentos | ❌ | No hay límite — `callAttemptRef` se incrementa pero no se usa como límite (solo para cancelar operaciones en curso) |

---

## 10. UI

| Aspecto | Estado | Evidencia |
|---------|--------|-----------|
| Botón de iniciar llamada | ❌ | No existe |
| Botón de iniciar videollamada | ❌ | No existe |
| Loader durante connecting | ✅ | `callStatusLabel === 'Conectando'` se muestra |
| Timer de llamada | ✅ | `callElapsedSeconds` con `formatDuration` |
| Nombre del contacto | ✅ | `activeConversation.title` |
| Avatar | ✅ | `CallMediaTile` con label |
| Botón mute | ✅ | `toggleCallMute` (aunque no funcional sin tracks) |
| Botón cámara | ✅ | `toggleCamera` (aunque no funcional sin tracks) |
| Botón colgar | ✅ | Llama `closeActiveCall()` |

---

## 11. Múltiples Conversaciones

| Escenario | Estado | Evidencia |
|-----------|--------|-----------|
| Llamar mientras hay otra llamada | ❌ | No hay botón para iniciar llamada |
| Dos PeerConnection activas | ❌ | `peerRef.current` es singleton — se reemplaza cada vez |
| Cambiar de chat durante llamada | ✅ | Effect línea 1088-1112: detecta mismatch de roomId y cierra llamada |

---

## 12. Seguridad

| Aspecto | Estado | Evidencia |
|---------|--------|-----------|
| Autenticación en socket | ✅ | `auth: token ? { token } : undefined` línea 121 |
| Autorización | ⚠️ | Depende del servidor validar el token |
| Destinatarios correctos | ✅ | `targetSocketId` en cada evento |
| Llamadas cruzadas entre organizaciones | ✅ | El servidor debe manejar esto — el cliente solo usa `roomId` de la conversación |

---

## 13. Rendimiento

| Aspecto | Estado | Evidencia |
|---------|--------|-----------|
| Renders innecesarios | ⚠️ | `setCallSession`, `setCallParticipants`, `setCallNotice` se llaman en cada evento WebRTC — no hay batching |
| Listeners duplicados | ⚠️ | Potencial si el efecto se re-ejecuta sin cleanup completo |
| Sockets duplicados | ⚠️ | Posible si el efecto se re-ejecuta antes de que el cleanup del anterior complete la desconexión |
| PeerConnections duplicadas | ✅ | `buildPeerConnection` resetea la anterior |
| MediaStreams duplicados | ✅ | `localStreamRef.current` es singleton |

---

## 14. Hallazgos de la Limpieza RC-CHAT-CLEANUP-INTEGRATION-01

La limpieza anterior eliminó correctamente:

| Referencia | Estado |
|------------|--------|
| `handleOpenRadioFromChat` | ✅ Eliminada |
| Botón Radio en header | ✅ Eliminado |
| `router` import (solo usado por radio) | ✅ Eliminado |

Sin impacto en WebRTC.

---

## 15. Resumen de Hallazgos — Priorizados

### 🔴 Críticos (bloquean certificación)

| # | Hallazgo | Archivo:línea | Impacto |
|---|----------|---------------|---------|
| C1 | **WebRTC solo funciona en web** (`Platform.OS !== 'web'`) | `use-chat-controller.ts:118` | En Android/iOS el socket nunca se crea → llamadas no funcionan |
| C2 | **No hay `getUserMedia` para WebRTC** | `use-chat-controller.ts` (falta) | `localStreamRef.current` siempre null → sin audio/video local |
| C3 | **Nunca se emite `rtc:join` al entrar a una conversación** | `use-chat-controller.ts` (falta) | El servidor no sabe que el usuario está en la sala → no hay participantes → no hay llamada |
| C4 | **No hay botón para iniciar llamada/videollamada** | `chat-screen-view.tsx` (falta) | El usuario nunca puede iniciar una llamada explícitamente |

### 🟡 Altos

| # | Hallazgo | Archivo:línea | Impacto |
|---|----------|---------------|---------|
| H1 | **No hay eventos de timbre/notificación** (`rtc:call`, `rtc:ringing`, `rtc:busy`, `rtc:reject`) | Falta en signaling | Usuario no sabe que recibe una llamada |
| H2 | **No hay `rtc:hangup` del lado local** | Falta en `closeActiveCall` | El otro usuario no recibe notificación de cuelgue (solo `rtc:leave`) |
| H3 | **No hay listener para `rtc:leave`** | Falta | Cuando alguien se va, el otro no se entera |
| H4 | **Mute/Cámara no funcionales** | `toggleCallMute:850`, `toggleCamera:858` | Operan sobre `localStreamRef.current` que es null |
| H5 | **Estados incompletos**: faltan `idle`, `calling`, `ringing`, `ended`, `failed`, `busy`, `rejected` | `types.ts:7` | La máquina de estados no cubre casos reales |

### 🟢 Medios

| # | Hallazgo | Archivo:línea | Impacto |
|---|----------|---------------|---------|
| M1 | Sin límite de reintentos en reconexión | Línea 823 `callAttemptRef` se incrementa pero no se consulta | Bucle infinito de reconexión |
| M2 | No hay deduplicación de ICE candidates | Línea 319-323 | Candidates duplicados agregados al peer |
| M3 | `peer.onconnectionstatechange === 'failed'` setea `reconnecting` en lugar de `failed` | Línea 218-226 | Transición inválida |

---

## 16. Validaciones Técnicas

| Validación | Resultado | Nota |
|------------|-----------|------|
| `tsc --noEmit` | ❌ 4 errores | Todos en `map-screen.native.tsx`, `MapCanvas.tsx`, `point-to-point-tracker.ts` — **pre-existentes, no relacionados** |
| ESLint | ⏳ No ejecutado | No hay script de ESLint configurado |
| Build Android Debug | ⏳ No ejecutado | Requiere dispositivo/emulador |
| Build Android Release | ⏳ No ejecutado | Requiere dispositivo/emulador |

---

## 17. Archivos Modificados

Ninguno. Esta auditoría es solo diagnóstica. No se aplicaron cambios.

---

## 18. Dictamen Final

### ❌ NO CERTIFICADO PARA PRODUCCIÓN

**Razón principal:** El sistema de llamadas y videollamadas no es funcional en su estado actual debido a 4 hallazgos críticos que impiden cualquier flujo de llamada:

1. **🔴 C1**: El socket WebRTC solo se inicializa en web (`Platform.OS !== 'web'`). En dispositivos móviles (Android/iOS), el socket nunca se crea. La totalidad del signaling `rtc:*` no existe en mobile.

2. **🔴 C2**: No hay llamada a `navigator.mediaDevices.getUserMedia()` para WebRTC. El `localStreamRef.current` siempre es `null`. Sin streams locales, no hay audio ni video que enviar. La `RTCPeerConnection` se crea sin tracks. Mute y cámara operan sobre colecciones vacías.

3. **🔴 C3**: `rtc:join` nunca se emite al abrir una conversación. Solo se emite en reconexión del socket y cuando la peer connection falla. El servidor nunca agrega al usuario a la sala WebRTC → nunca recibe `rtc:participants` → el flujo nunca avanza.

4. **🔴 C4**: No hay botones para iniciar llamada o videollamada. El sistema depende de que ambos usuarios estén viendo la misma conversación simultáneamente y que el `localeCompare` de socket ID decida quién inicia.

### Para obtener certificación se requiere:

1. Agregar `getUserMedia` para obtener stream local de audio/video
2. Emitir `rtc:join` al seleccionar/abrir una conversación
3. Eliminar el guard `Platform.OS !== 'web'` o proporcionar implementación nativa para mobile
4. Agregar botones "Llamar" y "Videollamada" en el header de conversación
5. Implementar protocolo de timbre (`rtc:call`/`rtc:ringing`) con aceptación/rechazo explícito
6. Completar la máquina de estados con `idle`, `calling`, `ringing`, `ended`, `failed`, `busy`, `rejected`
7. Emitir `rtc:hangup` desde el lado local al colgar
8. Agregar listener para `rtc:leave`
9. Agregar límite de reintentos en reconexión
10. Verificar en Android 11+ real

---

## 19. Nota sobre la tarea RC-CHAT-CLEANUP-INTEGRATION-01

La limpieza de referencias al Radio en el Chat se completó correctamente en una iteración anterior. No afecta al sistema WebRTC.
