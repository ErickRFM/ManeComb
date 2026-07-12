# MediaPlayer

## Propiedad y ciclo de vida

Cada `RadioPlayerSession` nativa posee un MediaPlayer. `startRadioHistoryPlayer` reutiliza la instancia solo para el mismo `playerId` y URI cuando esta preparada; antes de iniciar libera todas las sesiones con otro id. Pause y resume operan sobre esa misma instancia.

Prepare obtiene la duracion nativa. El estado consulta `MediaPlayer.currentPosition` y `MediaPlayer.duration`. Completion marca `didFinish`, posiciona en cero, publica `FINISHED`, libera Visualizer y abandona foco. Error publica `ERROR`; stop/cambio de fuente/desmontaje ejecutan release.

## Evidencia fisica

Logcat del 2026-07-11:

- Play: `AudioTrack start`, session `2801`.
- Pause: `AudioTrack pause`, session `2801`.
- Resume: `AudioTrack start`, session `2801`.
- Completion: `AudioTrack stop`, session `2801`, seguido de `abandonAudioFocus`.

No se creo una segunda sesion durante Pause/Resume. La UI avanzo 0:02 -> 0:03 y completion regreso a 0:00.

## Pendiente fisico

Seek manual, rotacion, cambio de tarjeta repetitivo, background/foreground y 10 ciclos consecutivos no se ejecutaron en esta sesion.
