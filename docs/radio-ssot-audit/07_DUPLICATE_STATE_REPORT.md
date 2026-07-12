# Duplicate State Report

## Eliminados

- socket Radio independiente;
- `activeChannelId` local;
- `recordingState`, `isReceivingLive`, `isChannelBusy` y `realtimeConnectionState`;
- `liveOperator` y `liveTransmissionIdRef`;
- fase visual reconstruida desde varios estados;
- porcentaje de player alterno y completion artificial;
- metricas TX/RX/playback y senal no verificables.

`radioSessionRef` no tiene API de escritura independiente: conserva el ultimo objeto despachado para callbacks. Los alias de compatibilidad del bridge se normalizan en `audio.ts`; la UI consume solo los campos canonicos.

## Limites no confundidos con duplicacion

AudioRecord y AudioTrack producen niveles en fases mutuamente excluyentes. Visualizer produce el nivel del historial. Son tres dominios de audio diferentes y nunca compiten por el mismo componente visible.
