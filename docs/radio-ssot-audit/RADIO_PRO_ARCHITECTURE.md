# ManeComb Radio — Arquitectura de referencia

Documento unico de arquitectura de Radio/PTT. Sustituye a los informes parciales
previos de esta carpeta; el historico queda en git.

Estado del arbol al que corresponde: rama `feat/radio-pro-evolution`.

---

## 1. Autoridad unica

En Android, el duenio del subsistema Radio es el servicio nativo. React Native
envia comandos y observa instantaneas: no participa del camino critico del audio
ni de la sesion.

```text
                       MANECOMB APP
                            |
                    Global App State
                            |
              +-------------+-------------+
              |                           |
            Calls                       Radio
                                          |
                                 radio-live-store        <- proyeccion + comandos
                                          |
                                 radio-live-runtime      <- adaptador de plataforma
                                          |
                            comandos | instantaneas
                                          |
                             ManeCombRadioService        <- DUENIO de la sesion
                                          |
          +------------------+------------+------------------+
          |                  |                               |
   RadioCredentials   RadioSessionController          RadioAudioSession
   (Keystore)          + RadioSessionState             AudioRecord / AudioTrack
                       + RadioReconnectPolicy          RadioRxQueuePolicy
                       + RadioAudioRoute
                                          |
                             SocketIoRadioTransport
                                          |
                                       Backend
                                          |
                       Redis floor authority (NX/PX + Lua)
                                          |
                                 Persistencia WAV
                                          |
                            Message store (historial)
```

Consumidores del estado, todos por observacion o comando:

- pantalla de Radio (`radio-screen-view.tsx`)
- `RadioLiveOverlay` (ancla de sesion/canal/preempcion, no renderiza UI)
- notificacion del foreground service

---

## 2. Matriz de autoridad

| Hecho | Productor unico | Consumidores |
|---|---|---|
| canal seleccionado | `activeConversationId` (app store) | overlay -> comando `selectChannel` |
| identidad de sesion | app store (auth) -> `RadioCredentials` | servicio nativo |
| transporte conectado | `SocketIoRadioTransport` | `RadioSessionController` |
| unido al canal | ACK de `radio:join` | controlador nativo |
| autorizacion | ACK del backend | controlador nativo |
| floor ownership | backend + lock Redis | controlador nativo (ACK `radio:start`) |
| transmitting | `RadioSessionController` (tras ACK) | audio nativo, UI |
| receiving | `RadioSessionController` (broadcast) | audio nativo, UI |
| operador actual | payload del backend | UI |
| frames TX | `RadioAudioSession` -> controlador -> socket nativo | backend |
| frames RX | socket nativo -> controlador -> `AudioTrack` | audio |
| admision de frames RX | `RadioRxQueuePolicy` | audio |
| audio route | `RadioAudioRoute` | AudioTrack, MediaPlayer, UI |
| reconnect | `RadioReconnectPolicy` (nativo) | transporte |
| foreground state | `ManeCombRadioService` | Android, UI |
| call preemption | `setRadioCallActive` -> controlador | audio, transporte |
| historial | store global deduplicado por `message.id` | pagina Audios |
| player de historial | manager serial de `native/audio.ts` | tarjetas |

Ninguna fila tiene dos productores finales. React no produce ninguno de los
hechos operativos: los proyecta.

---

## 3. Maquina de estados

Definida en `RadioSessionState.kt` y proyectada tal cual a TypeScript
(`RadioLivePhase`). Mismo vocabulario en ambos lados, sin traduccion.

```text
IDLE
  -> JOINING            activate(channelId)
JOINING
  -> LISTENING          ACK de radio:join
  -> UNAUTHORIZED       forbidden / unauthorized
  -> ERROR              join fallido por red
LISTENING
  -> REQUESTING         requestTransmission()
  -> RECEIVING          radio:start de otro operador
REQUESTING
  -> TRANSMITTING       ACK de radio:start + captura abierta
  -> CHANNEL_BUSY       channel_busy
  -> UNAUTHORIZED       forbidden
TRANSMITTING
  -> LISTENING          endTransmission(), radio:end del backend,
                        perdida de transporte o fallo de audio
RECEIVING
  -> LISTENING          radio:end
CHANNEL_BUSY
  -> LISTENING          radio:end del canal (solo el backend lo libera)
*
  -> RECONNECTING       transporte caido, con backoff acotado
  -> PAUSED_BY_CALL     setRadioCallActive(true)
  -> IDLE               deactivate() (logout / cambio de cuenta)
```

Invariantes certificadas en `RadioSessionReducerTest`:

- `LISTENING` solo procede del ACK de `radio:join`. Conectar el socket no
  equivale a estar en el canal.
- `REQUESTING` solo desde `LISTENING`: un canal con dueno ajeno no se pide.
- `TRANSMITTING` solo desde `REQUESTING`: un `FloorGranted` sin peticion previa
  no abre el microfono.
- El emisor ignora el eco de su propio `radio:start`; su autoridad es el ACK.
- `CHANNEL_BUSY` no guarda el `transmissionId` ajeno y lo libera cualquier
  `radio:end` del canal.
- Durante `PAUSED_BY_CALL` nada del canal reactiva audio.
- Al terminar la llamada se vuelve a `JOINING`, nunca a `TRANSMITTING`.

---

## 4. Flujo de datos

### Transmision

```text
PTT (pantalla) -> store.requestTransmission()
              -> runtime adapter -> ManeCombAudio.requestRadioTransmission()
              -> RadioSessionController.requestTransmission()
              -> radio:start (ACK, socket NATIVO)
              -> RadioAudioSession.startCapture()
              -> foreground service pasa a tipo microphone

AudioRecord (hilo nativo, PCM16 16 kHz mono, 20 ms / 640 bytes)
              -> RadioSessionController.onFrameCaptured
              -> SocketIoRadioTransport.sendFrame -> radio:frame
```

Ni un frame PCM cruza el bridge de React Native.

### Recepcion

```text
radio:start (socket nativo) -> controlador -> RadioAudioSession.startPlayback
radio:frame                 -> RadioRxQueuePolicy.admit -> AudioTrack
radio:end                   -> stopPlayback -> LISTENING
```

### Estado hacia React

```text
RadioSessionController -> ManeCombRadioService.publishState
                       -> evento ManeCombRadioState (baja frecuencia)
                       -> radio-live-runtime.subscribe
                       -> radio-live-store (proyeccion)
                       -> consola / overlay
```

El nivel de audio para la waveform se publica aparte, suavizado a ~12 Hz
(`LEVEL_INTERVAL_MS`), muy por debajo de los 50 Hz del audio: el metering es
informacion de UI y no marca el ritmo de React.

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

- Fases publicadas por el nativo: `PREPARING`, `READY`, `PLAYING`, `PAUSED`,
  `SEEKING`, `FINISHED`, `ERROR`, `RELEASED`.
- Polling recursivo con `setTimeout` y numero de generacion: como maximo un
  timeout activo y las respuestas tardias se descartan.
- El historial no puede sonar mientras el canal en vivo posee el audio: el
  modulo consulta `RadioAudioSession.ownsAudio()` y rechaza con
  `radio_channel_active`.

---

## 5. Corte de captura sin React

El controlador nativo cierra el microfono por si mismo, sin depender de que
exista un componente montado ni de que el runtime JS este despierto, ante:

- `radio:end` del backend para la transmision propia (timeout, cadencia,
  `authority_lost`, `max_duration`)
- transporte caido o `radio:error` del servidor
- fallo de `AudioRecord` o perdida de audio focus
- `sendFrame` rechazado por el socket
- llamada entrante, cambio de canal, logout

En todos los casos se libera tambien el canal en el backend (`radio:end`), de
modo que no queda ocupado por una sesion que ya no transmite.

---

## 6. Android nativo

| Pieza | Responsabilidad |
|---|---|
| `ManeCombRadioService` | duenio de la sesion: compone controlador, audio y transporte; foreground y notificacion |
| `RadioSessionController` | orquesta maquina, transporte, audio y reconexion |
| `RadioSessionState` | maquina de estados pura (certificada en JVM) |
| `SocketIoRadioTransport` | cliente Socket.IO nativo de los contratos `radio:*` |
| `RadioAudioSession` | unica `AudioRecord` y unica `AudioTrack` del proceso |
| `RadioRxQueuePolicy` | admision acotada de frames recibidos |
| `RadioReconnectPolicy` | unico backoff de reconexion de Radio |
| `RadioAudioRoute` | unica autoridad de salida de audio |
| `RadioCredentials` | identidad de sesion cifrada (AndroidKeystore) |
| `ManeCombAudioModule` | puente RN: comandos e instantaneas; grabacion e historial |

### Transporte

`io.socket:socket.io-client`, reutilizando el OkHttp que React Native ya trae.
Habla los contratos existentes: `radio:join`, `radio:leave`, `radio:start`,
`radio:frame`, `radio:end`, `radio:error`. **No hay protocolo nuevo.**

La reconexion propia de Socket.IO esta **deshabilitada**
(`reconnection = false`): el unico algoritmo de reconexion de Radio es
`RadioReconnectPolicy`, con backoff exponencial acotado y jitter. Dos algoritmos
compitiendo producirian rejoins cruzados.

Los ACK llevan timeout propio (5 s): un backend que no responde no puede dejar al
operador esperando con el canal a medio pedir.

### Foreground service

- tipo `mediaPlayback` mientras se escucha; `mediaPlayback|microphone` mientras
  se transmite. Android 14+ rechaza capturar en segundo plano sin el tipo
  `microphone` declarado y concedido.
- si falta `RECORD_AUDIO`, degrada a `listening` en vez de arrancar con un tipo
  que el sistema rechazaria.
- `START_NOT_STICKY`: el servicio no puede reconstruir la sesion por si mismo,
  asi que no se relanza dejando una notificacion sin canal detras.
- la notificacion se deriva del estado real (`notificationTextFor`): "Escuchando
  el canal", "Transmitiendo en el canal", "Recibiendo de X", "Reconectando".

### Ruta de audio

`RadioAudioRoute` expresa preferencia con `setPreferredDevice` sobre `AudioTrack`
y `MediaPlayer`. No toca el modo global de audio ni el speakerphone, para no
competir con Llamadas. Sin seleccion explicita conserva la prioridad
Bluetooth > cable > altavoz.

### Credenciales

`ManeCombSecureStore` (AES/GCM sobre AndroidKeystore) es la unica cripto de
credenciales nativas; la comparten GPS y Radio con **alias distintos**, de modo
que limpiar uno no invalida al otro. El token de Radio nunca se guarda en claro
ni se escribe en logs.

`deactivate()` destruye socket, canal, floor, captura, reproduccion,
notificacion, foreground e identidad persistida. No queda sesion fantasma tras
logout ni tras cambio de cuenta.

---

## 7. Integracion con Llamadas

Llamadas y Radio no pueden poseer el microfono a la vez. La unica autoridad de
preempcion es `setRadioCallActive`, disparada por el overlay a partir de
`call-store.phase`:

```text
CONNECTING | CONNECTED | RECONNECTING | ENDING
    -> setRadioCallActive(true) -> controlador libera audio y floor
    -> PAUSED_BY_CALL
fin de llamada
    -> setRadioCallActive(false) -> JOINING -> LISTENING
```

Al terminar la llamada **nunca** se restaura la transmision perdida: el operador
vuelve a pulsar PTT. Reanudar solo produciria audio que nadie sabe que se esta
enviando.

---

## 8. Backend

Sin cambios en esta tanda. Contratos vigentes: `radio:join`, `radio:leave`,
`radio:start`, `radio:frame`, `radio:end`, `radio:error`, `radio:message:new`.

- `modules/radio/floor-control.js`: unica implementacion del arbitraje. Lock
  Redis `SET NX PX`, refresco y liberacion con Lua condicionadas al valor propio.
  Con Redis habilitado pero no disponible **falla** en vez de degradar a memoria
  local.
- `modules/radio/live-stream.js`: `evaluateFrame` concentra orden, cadencia y
  tamanio. `duplicate` descarta el frame; `rate_exceeded`, `max_duration` e
  `invalid_frame` terminan la transmision.
- Limites: 640 bytes por frame, 20 ms, maximo 60 s por transmision, timeout de
  abandono a 65 s, ACL por conversacion y aislamiento por organizacion.

---

## 9. Plataformas

| Plataforma | PTT en vivo | Implementacion |
|---|---|---|
| Android | si | servicio nativo (este documento) |
| Web | no | notas de voz completas (`MediaRecorder` + subida) |
| iOS | no | sin modulo nativo; adaptador inactivo |

`radio-live-runtime` elige el adaptador por plataforma. Es un adaptador debajo
del mismo dominio, no un segundo dominio de Radio. La consola declara
explicitamente el modo de notas de voz en lugar de simular un canal en vivo.

---

## 10. Limites conocidos

1. **Sin certificacion fisica.** El codigo esta completo y validado de forma
   automatizada, pero no se ejecuto en dispositivos reales. Ver
   `RADIO_PRO_VALIDATION.md`.
2. Protocolo v1 (PCM16 + base64 + Socket.IO). Opus, frames binarios y jitter
   buffer no se abordaron: son la siguiente fase, ahora desbloqueada.
3. Sin PTT por hardware/Bluetooth ni VOX. El comando unico ya existe
   (`requestTransmission` / `endTransmission`), asi que una fuente adicional se
   conecta ahi sin crear otro flujo.
4. El servicio usa `START_NOT_STICKY`: si Android mata el proceso, la sesion se
   reactiva cuando la app vuelve, no antes.
