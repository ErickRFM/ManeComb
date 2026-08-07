# ManeComb Radio — Arquitectura de referencia

Documento unico de arquitectura de Radio/PTT. Sustituye a los informes parciales
previos de esta carpeta (`01_STATE_GRAPH`, `06_SINGLE_SOURCE_REPORT`,
`11_BACKGROUND_JS_AUDIT`, `RADIO_COHERENCE_REPORT` y el resto): describian un
diseno con dos autoridades operativas que ya no existe. El historico queda en
git; esta pagina es la referencia vigente.

Estado del arbol al que corresponde: rama `feat/radio-pro-evolution`.

---

## 1. Autoridad unica

```text
                       MANECOMB APP
                            |
                    Global App State
                            |
              +-------------+-------------+
              |                           |
            Calls                       Radio
                                          |
                                 radio-live-store        <- estado + comandos
                                          |
                                 radio-live-machine      <- transiciones puras
                                          |
                                 radio-live-runtime      <- unico duenio operativo
                                          |
                    +---------------------+---------------------+
                    |                                           |
          RadioRealtimeService                          ManeCombAudioModule
          (socket global compartido)                    AudioRecord / AudioTrack
                    |                                   RadioAudioRoute
                    |                                   ManeCombRadioService (FGS)
                 Backend
                    |
          Redis floor authority (lock NX/PX + Lua)
                    |
              Persistencia WAV
                    |
             Message store (historial)
```

Consumidores del runtime, todos por observacion o comando:

- pantalla de Radio (`radio-screen-view.tsx`)
- `RadioLiveOverlay` (ancla de sesion/canal/preempcion, no renderiza UI)
- notificacion del foreground service

No existe un "runtime de pantalla" ni un "runtime global" separados.

---

## 2. Matriz de autoridad

| Hecho | Productor unico | Consumidores |
|---|---|---|
| canal activo | `activeConversationId` (app store) | overlay -> runtime, pantalla |
| conexion / join | `RadioRealtimeService` dentro del runtime | `radio-live-machine` |
| autorizacion | ACK de `radio:join` | machine (`UNAUTHORIZED`) |
| floor ownership | backend + lock Redis | runtime (ACK `radio:start`) |
| transmitting | machine (`TX_START` tras ACK) | UI, captura nativa |
| receiving | machine (`RECEIVING` por broadcast) | UI, reproduccion nativa |
| operador actual | payload del backend | UI |
| frames TX | `ManeCombAudioModule` -> runtime -> socket | backend |
| frames RX | socket -> runtime -> `AudioTrack` | audio |
| audio route | `RadioAudioRoute` (nativo) | AudioTrack, MediaPlayer, UI |
| foreground state | `radio-foreground-service` (coordinador) | `ManeCombRadioService` |
| call preemption | `useRadioLiveStore.pause('call')` | runtime |
| historial | store global deduplicado por `message.id` | pagina Audios |
| player de historial | manager serial de `native/audio.ts` | tarjetas |
| reconnect | `RadioRealtimeService` | machine |

Ninguna fila tiene dos productores finales.

---

## 3. Maquina de estados

`RadioLivePhase` (`radio-live-types.ts`):

```text
IDLE
  -> JOINING            activate()
JOINING
  -> LISTENING          ACK radio:join
  -> UNAUTHORIZED       forbidden / unauthorized
  -> ERROR              fallo de transporte
LISTENING
  -> REQUESTING         requestTransmission()
  -> RECEIVING          radio:start de otro operador
REQUESTING
  -> TRANSMITTING       ACK radio:start + captura iniciada
  -> CHANNEL_BUSY       channel_busy
  -> RECONNECTING       radio_disconnected / radio_ack_timeout
TRANSMITTING
  -> LISTENING          endTransmission() o radio:end del backend
RECEIVING
  -> LISTENING          radio:end
CHANNEL_BUSY
  -> LISTENING          radio:end del canal (solo el backend lo libera)
*
  -> RECONNECTING       transporte offline/reconnecting
  -> PAUSED_BY_CALL     pause('call')
  -> ERROR              fallo de runtime/audio
  -> IDLE               reset() (logout / cambio de usuario)
```

Invariantes:

- `LISTENING` solo procede del ACK de `radio:join`. Nunca de un temporizador.
- `REQUESTING` solo se alcanza desde `LISTENING`: el canal con dueno no se pide.
- `TRANSMITTING` solo desde `REQUESTING`: la autoridad es el ACK, no el eco del
  broadcast `radio:start` (el emisor ignora su propio broadcast).
- `CHANNEL_BUSY` no guarda el `transmissionId` ajeno y termina con cualquier
  `radio:end` del canal.
- El cronometro y la animacion de TX dependen de `transmissionStartedAt`, que
  publica el runtime; la pantalla no lo inventa.

---

## 4. Flujo de datos

### Transmision

```text
PTT (pantalla) -> store.requestTransmission()
              -> runtime.requestTransmission()
              -> radio:start (ACK)
              -> setForegroundServiceMode('transmitting')   [tipo microphone]
              -> startPttAudioCapture(transmissionId)
AudioRecord (hilo nativo, PCM16 16 kHz mono, frames de 20 ms / 640 bytes)
              -> evento ManeCombPttFrame
              -> runtime (suscripcion propia, no de React)
              -> RadioRealtimeService.sendFrame -> radio:frame
```

### Recepcion

```text
radio:start -> runtime -> machine RECEIVING -> UI
radio:frame -> runtime -> enqueuePttAudioFrame -> AudioTrack (RadioAudioRoute)
radio:end   -> runtime -> machine LISTENING
```

### Historial

```text
backend concatena PCM -> WAV -> uploadChatAudioAsset -> store.addMessage
        -> radio:message:new (sala conversation:<id>)
        -> store global (merge por message.id)
        -> pagina Audios -> player nativo serializado
```

El historial reutiliza el modelo `Message`; no hay un modelo de audio propio de
Radio.

### Player de historial (motor vigente)

Autoridad unica en `native/audio.ts`: cola serial `serializeRadioPlayerOperation`
para play/pause/stop/seek, un solo `activeRadioPlayerId`, y el modulo Android
libera cualquier otra sesion antes de iniciar una nueva.

```text
tarjeta -> useAudioPlayer -> cola serial -> bridge -> RadioPlayerSession
        -> MediaPlayer / Visualizer / AudioFocus -> PlayerStatus -> tarjeta
```

- Fases publicadas por el nativo: `PREPARING`, `READY`, `PLAYING`, `PAUSED`,
  `SEEKING`, `FINISHED`, `ERROR`, `RELEASED`. `FINISHED` es estable tras
  completion; el hook nunca calcula posicion, duracion ni completion.
- Polling recursivo con `setTimeout` y numero de generacion: como maximo un
  timeout activo y las respuestas tardias se descartan.
- El historial no puede reproducirse durante una transmision PTT
  (`radio_channel_active`); iniciar captura libera cualquier player activo.
- Riesgo residual: no hay prueba automatizada que inyecte respuestas nativas
  fuera de orden; la cola y la generacion lo previenen por construccion.

---

## 5. Corte de captura sin React

El runtime cierra la captura por si mismo, sin depender de que un componente
siga montado, ante:

- `radio:end` del backend para la transmision propia (timeout, cadencia,
  `authority_lost`, `max_duration`)
- transporte `offline` / `reconnecting` / `unauthorized` / `error`
- `ManeCombPttError` nativo
- `sendFrame` rechazado (socket caido)
- `stop()` del runtime (cambio de canal, llamada, logout)

En todos los casos emite `onCaptureLost`, el store publica `TX_END` y guarda el
codigo real del fallo.

---

## 6. Android nativo

| Pieza | Responsabilidad |
|---|---|
| `ManeCombAudioModule` | captura/reproduccion PTT, grabacion y player de historial, audio focus |
| `RadioAudioRoute` | autoridad unica de salida (`auto`/`bluetooth`/`wired`/`speaker`/`earpiece`) |
| `ManeCombRadioService` | contenedor foreground + notificacion de estado real |

Foreground service:

- tipo `mediaPlayback` mientras se escucha, `mediaPlayback|microphone` mientras
  se transmite. Android 14+ rechaza capturar en segundo plano sin el tipo
  `microphone` declarado y concedido.
- si falta el permiso `RECORD_AUDIO`, el servicio degrada a `listening` en vez
  de arrancar con un tipo que el sistema rechazaria.
- `START_NOT_STICKY`: el servicio no puede reconstruir la sesion por si mismo,
  asi que no se relanza dejando una notificacion sin canal detras.
- la notificacion dice "Escuchando el canal" o "Transmitiendo en el canal"; ya
  no afirma "Canal preparado" cuando el runtime esta caido.

Ruta de audio: `RadioAudioRoute` expresa preferencia con `setPreferredDevice`
sobre `AudioTrack` y `MediaPlayer`. No cambia el modo global de audio ni el
speakerphone, para no competir con Llamadas. Sin seleccion explicita conserva la
prioridad Bluetooth > cable > altavoz.

---

## 7. Integracion con Llamadas

Llamadas y Radio no pueden poseer el microfono a la vez. La unica autoridad de
preempcion es `useRadioLiveStore.pause('call')`, disparada por el overlay a
partir de `call-store.phase`:

```text
CONNECTING | CONNECTED | RECONNECTING | ENDING -> pause('call') -> PAUSED_BY_CALL
fin de llamada -> activate() -> JOINING -> LISTENING
```

`pause('call')` detiene el runtime completo: cierra transporte, captura,
reproduccion y foreground service. Se elimino la bandera global
`setRadioRealtimeSuspended`, que existia solo porque la pantalla mantenia un
transporte propio que el overlay no podia detener.

---

## 8. Backend

Contratos (sin cambios): `radio:join`, `radio:start`, `radio:frame`,
`radio:end`, `radio:leave`. `radio:leave` esta vigente y se usa para abandonar
la sala al cambiar de canal o al detener el runtime; documentacion previa que lo
daba por eliminado era incorrecta.

- `modules/radio/floor-control.js`: unica implementacion del arbitraje. Lock
  Redis `SET NX PX`, refresco y liberacion con Lua condicionadas al valor propio.
  Con Redis habilitado pero no disponible **falla** en vez de degradar a memoria
  local: Radio indisponible es preferible a dos transmisores creyendose duenos.
- `modules/radio/live-stream.js`: `evaluateFrame` concentra orden, cadencia y
  tamanio. `duplicate` descarta el frame; `rate_exceeded`, `max_duration` e
  `invalid_frame` terminan la transmision.
- Limites: 640 bytes por frame, 20 ms, maximo 60 s por transmision, timeout de
  abandono a 65 s, ACL por conversacion y aislamiento por organizacion.
- Cada `radio:frame` renueva el TTL del lock; si el refresco falla se emite
  `radio:end` con `authority_lost`.

---

## 9. Web

Web no tiene PTT en vivo: graba una nota de voz completa con `MediaRecorder` y
la sube. La consola lo dice explicitamente ("Nota de voz", "Manten presionado
para grabar") en lugar de simular un canal en vivo, y el runtime PCM no se
levanta en esa plataforma.

---

## 10. Limites conocidos

1. **El transporte de Radio sigue viviendo en JavaScript.**
   `ManeCombRadioService` es contenedor foreground y notificacion; no posee
   socket, autenticacion, join, framing TX ni cola RX. Con el proceso React
   suspendido en background profundo o Doze, los frames dejan de fluir. El
   trabajo de esta rama reduce el riesgo (tipo de servicio correcto,
   notificacion veraz, corte de captura autonomo, sin `START_STICKY` enganoso)
   pero **no** convierte al servicio en propietario del transporte. Ver
   `RADIO_PRO_VALIDATION.md`.
2. Sin certificacion fisica entre dos dispositivos.
3. Protocolo v1 (PCM16 + base64 + Socket.IO). Opus/binario no se evaluo: §14 del
   encargo lo condiciona a estabilizar antes runtime, background y backend.
4. Sin PTT por hardware/Bluetooth ni VOX.
