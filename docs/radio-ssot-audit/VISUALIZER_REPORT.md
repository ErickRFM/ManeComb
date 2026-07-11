# Visualizer

## Flujo

`MediaPlayer.audioSessionId` -> `createRadioVisualizer` -> captura de waveform nativa -> nivel normalizado -> `RadioPlayerSession.level` -> `radioPlayerStatusMap` -> bridge -> `useAudioPlayer` -> `radio-transmission-card`.

Existe un Visualizer por sesion nativa. Se crea despues de prepare y se libera en `releaseRadioPlayer`. Cambiar de tarjeta libera primero la sesion anterior. Pause y completion publican nivel cero; resume conserva la misma sesion.

## Evidencia

Durante reproduccion las barras cambiaron de estado inactivo a amplitud visible; en Pause y Completion volvieron al nivel inactivo. El valor mostrado procede exclusivamente de `PlayerStatus.level`.

## Limite

La inspeccion visual confirma actividad, no calibra la amplitud contra instrumentacion acustica externa. Esa medicion permanece pendiente.
