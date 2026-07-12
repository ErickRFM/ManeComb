# AudioFocus

## Autoridad

El modulo Android es el unico productor de AudioFocus. Historial solicita `USAGE_MEDIA`/`CONTENT_TYPE_SPEECH`; recepcion PTT solicita `USAGE_VOICE_COMMUNICATION`/`CONTENT_TYPE_SPEECH`. Cada ruta conserva y abandona su propio `AudioFocusRequest`.

- LOSS y LOSS_TRANSIENT pausan la misma sesion.
- DUCK reduce volumen a 0.2.
- GAIN restaura volumen y reanuda solo si la pausa fue causada por foco.
- Pause, completion y release abandonan el foco.
- PTT LOSS detiene la salida mediante error nativo, DUCK reduce AudioTrack a 0.2 y GAIN restaura volumen.

## Evidencia

Logcat registro `requestAudioFocus()` al iniciar y reanudar, y `abandonAudioFocus()` al pausar y completar. No hubo dos clientes de foco del proceso durante el ciclo observado.

## Pendiente fisico

Spotify, llamada, duck/gain externo, Bluetooth y auriculares cableados requieren interaccion/accesorios no disponibles en esta ejecucion. No se certifican por inferencia.
