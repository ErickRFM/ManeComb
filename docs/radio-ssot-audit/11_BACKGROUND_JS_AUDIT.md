# Radio Background JS Audit

## Resultado

El PTT en vivo de Android **depende del runtime JavaScript para transmitir y recibir**. El `ManeCombRadioService` declarado como foreground service no contiene el transporte ni el pipeline de audio: solamente crea una notificacion persistente y devuelve `START_STICKY`.

Por lo tanto, la implementacion actual no garantiza continuidad con la pantalla bloqueada, la app en background profundo o el proceso React Native suspendido.

## Flujo comprobado

### Transmision

1. `radio-screen-view.tsx` obtiene el turno mediante `RadioRealtimeService.requestTransmission()`.
2. JS llama `startPttAudioCapture()`.
3. `ManeCombAudioModule.startPttCapture()` ejecuta `AudioRecord` en un hilo nativo.
4. Cada frame nativo se entrega a React Native con `ManeCombPttFrame` y `RCTDeviceEventEmitter`.
5. El listener JS llama `RadioRealtimeService.sendFrame()`.
6. Socket.IO JavaScript emite `radio:frame`.

Aunque `AudioRecord` usa un hilo nativo, el paso 4 requiere una instancia React activa (`hasActiveReactInstance()`) y los pasos 5-6 requieren que JS procese eventos.

### Recepcion

1. Socket.IO JavaScript recibe `radio:start` y `radio:frame`.
2. `RadioRealtimeService` entrega callbacks a `radio-screen-view.tsx`.
3. JS llama `startPttAudioPlayback()` y `enqueuePttAudioFrame()`.
4. `ManeCombAudioModule` escribe PCM en `AudioTrack`.

El `AudioTrack` es nativo, pero ningun frame llega a el sin los pasos 1-3 en JS.

## Que hace y que no hace el foreground service

| Capacidad | Estado actual |
|---|---|
| Notificacion persistente | Si |
| Mantener prioridad de proceso para reproduccion | Parcial |
| Socket autenticado y reconexion | No |
| Join/arbitraje de canal | No |
| Captura y envio autonomo | No |
| Recepcion y reproduccion autonoma | No |
| Buffer/jitter nativo | No |

El tipo `mediaPlayback` tampoco declara captura de microfono. Una solucion nativa de TX debe revisar permisos y `foregroundServiceType` aplicables a `microphone` en las versiones Android soportadas.

## Riesgo operativo

- TX puede seguir capturando localmente por un intervalo, pero los frames se descartan cuando React no esta activo y dejan de llegar al backend.
- RX deja de alimentar `AudioTrack` cuando JS no despacha los eventos Socket.IO.
- El lock distribuido expira al faltar frames/renovacion, pero el usuario puede ver una notificacion que sugiere que Radio sigue preparada.
- `START_STICKY` reinicia el contenedor del servicio, no reconstruye sesion, socket, canal ni transmision.

## Alcance del arreglo recomendado

Este problema requiere una iniciativa separada, no un parche de lifecycle:

1. Convertir `ManeCombRadioService` en propietario del socket de radio, autenticacion, join, reconexion y heartbeat.
2. Mover framing TX y encolado RX al servicio, sin cruzar el bridge por frame.
3. Exponer a React Native solo comandos y snapshots de estado de baja frecuencia.
4. Definir entrega/rotacion segura de credenciales al servicio y limpieza en logout.
5. Agregar buffer de jitter y politicas de perdida/reordenamiento nativas.
6. Ajustar manifest, permisos y tipos de foreground service para reproduccion y microfono.
7. Probar bloqueo de pantalla, Doze, background prolongado, cambio de red, proceso React destruido y recuperacion posterior.

## Criterio de cierre

No debe cerrarse el riesgo hasta demostrar en dos dispositivos fisicos que una transmision bidireccional continua con pantalla bloqueada y JS deliberadamente suspendido, incluyendo reconexion y liberacion correcta del canal.
