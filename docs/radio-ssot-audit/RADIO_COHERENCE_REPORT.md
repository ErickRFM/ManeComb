# RADIO-COHERENCE-01

## Flujo consolidado

Backend `activeRadioTransmissions` -> socket global compartido -> `RadioRealtimeService` filtrado por canal -> `RadioSessionState` -> derivados de render -> pantalla.

Historial: persistencia -> `radio:message:new` -> Store global deduplicado -> `loadedVoiceNotes` -> `VoiceTransmissionCard` -> player nativo.

## Inconsistencias corregidas

1. Se elimino el segundo cliente Socket.IO de Radio. El servicio adjunta y retira exclusivamente sus listeners del socket global sin desconectarlo.
2. `radio:join` es el unico join operativo de Radio y READY aparece despues de su ACK.
3. Se eliminaron los eventos duplicados `radio:busy` y `radio:leave`; arbitraje usa el ACK de `radio:start`.
4. El emisor ignora su propio broadcast `radio:start`; su autoridad es el ACK. Los receptores usan el broadcast.
5. `REQUESTING` representa la espera real de arbitraje; ya no existe un mutex invisible mientras la UI muestra READY.
6. Los timers temporales solo limpian mensajes en READY; nunca fabrican READY desde ERROR o CHANNEL_BUSY.
7. CHANNEL_BUSY termina exclusivamente con `radio:end` del canal.
8. Errores de AudioRecord/AudioTrack conservan `transmissionId` hasta `radio:end`; errores de persistencia no se presentan como desconexion.
9. Cambio de canal termina captura/reproduccion activa antes de unir el siguiente canal.
10. Completion nativo publica FINISHED y `OnSeekComplete` conserva FINISHED.
11. LOADING se publica en la misma fase que consume la tarjeta; un rechazo termina en ERROR y elimina buffering.
12. El polling del historial usa `isPlaying` canonico y una sola promesa a la vez.
13. La waveform de historial conserva picos reales del Visualizer alineados con 18 segmentos temporales; la PTT conserva niveles reales de captura/salida.
14. El relleno del historial depende solo de progress y admite una barra fronteriza parcial; la suma visual es exactamente `progress * 18`.
15. El endpoint HTTP de Radio emite solo `radio:message:new`, evitando el doble evento con `chat:message`.
16. Indicadores visibles ya no llaman operadores conectados a participantes ni muestran la fase como nombre del canal.
17. Animacion, halo, timer y waveform TX se inician y cancelan desde la fase canonica, incluida toda salida por error.
18. AudioTrack se crea bajo demanda antes de cualquier frame, usa escritura bloqueante y rechaza frames parciales.
19. `invalidate()` libera AudioRecord, AudioTrack, foreground service, MediaPlayer, Visualizer y AudioFocus.
20. Cargar historial de todos los canales ya no modifica `activeConversationId`.
21. Error nativo libera captura solo en TRANSMITTING y playback solo en RECEIVING.
22. La precarga de historial es secuencial y cancelable; no relanza peticiones pendientes cuando otro canal termina.
23. PTT e historial renderizan el mismo `RadioWaveform`; las barras usan flex y ocupan todo el ancho sin medidas horizontales fijas.
24. La consola elimina metricas y actividad duplicadas; conserva canal y ultima actividad en una sola fila adaptable.
25. El estado vacio ya no dibuja una waveform decorativa sin datos de audio.
26. PTT transmite solo frames PCM16 canonicos de 640 bytes y Backend exige secuencia contigua.
27. ACK tardio, perdido o perteneciente a otro canal no puede iniciar captura ni dejar el canal anterior ocupado.
28. Desconexion, cambio de canal, salida, logout, timeout y error nativo liberan el recurso correspondiente.
29. Backend vence transmisiones abandonadas a los 65 segundos y elimina la propiedad antes de persistir.

## Productores unicos

- Canal activo: Store (`activeConversationId`).
- Conexion y autorizacion Radio: ACK/eventos sobre el socket global.
- Sesion PTT: `radioSessionReducer`.
- Arbitraje: Backend `activeRadioTransmissions`.
- Frames TX/RX: bridge nativo y eventos `radio:frame`.
- Historial: Store deduplicado por `message.id`.
- Player: manager serial de `audio.ts` y una sesion nativa activa.
- Position/duration/completion: MediaPlayer.
- Amplitud playback: Visualizer.
- Progress: `currentPosition / duration`.

## Validaciones

- TypeScript: aprobado.
- ESLint: aprobado.
- Mobile: 8 suites, 43 pruebas.
- Backend: suite completa aprobada.
- PCM/WAV live stream automatizado: aprobado.
- Android Release: aprobado.
- `git diff --check`: aprobado; solo avisos CRLF.

APK generado: `mobile/android/app/build/outputs/apk/release/app-release.apk`.

## Limite de evidencia

La coherencia estatica, automatizada y de compilacion queda demostrada. Esta ejecucion no incluye una prueba fisica simultanea entre dos dispositivos, por lo que no constituye certificacion fisica de latencia o audio de campo.
