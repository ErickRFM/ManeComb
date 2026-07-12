# RADIO-STABILIZATION-03 - Player Engine

## Fuente unica

El historial usa un administrador unico en `mobile/src/native/audio.ts`. Todas las operaciones Radio pasan por `serializeRadioPlayerOperation`; `activeRadioPlayerId` identifica la unica tarjeta activa y el modulo Android libera cualquier otra sesion antes de iniciar una nueva.

Flujo: tarjeta -> `useAudioPlayer` -> cola serial -> bridge -> `RadioPlayerSession` -> MediaPlayer/Visualizer/AudioFocus -> `PlayerStatus` -> tarjeta.

## Estados

El productor nativo publica `PREPARING`, `READY`, `PLAYING`, `PAUSED`, `SEEKING`, `FINISHED`, `ERROR` y `RELEASED`. Loading es la espera de la promesa de inicio en el hook; no calcula posicion, duracion ni completion. `FINISHED` es el estado estable despues de completion.

## Garantias

- Una operacion nativa en vuelo por la cola del administrador.
- Un solo `activeRadioPlayerId` y un solo polling activo.
- Cambiar de tarjeta detiene y reinicia visualmente la anterior.
- Completion, pause, resume, seek y release son producidos por MediaPlayer.

## Evidencia

En OnePlus 9 Pro, Play/Pause/Resume conservaron la sesion AudioTrack `2801`; completion regreso a `0:00`, `Listo` y abandono AudioFocus. Quedan pendientes rotacion, background, pantalla apagada, accesorios y pruebas repetitivas completas.

## Resultado

Motor determinista implementado. Certificacion fisica integral pendiente.
