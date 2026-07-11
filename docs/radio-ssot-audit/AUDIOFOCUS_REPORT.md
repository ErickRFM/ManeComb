# AudioFocus

## Autoridad

El modulo Android es el unico productor de AudioFocus del historial. Solicita `USAGE_MEDIA`/`CONTENT_TYPE_SPEECH`, registra un listener y publica `granted`, `lost`, `ducked` o `none` en `PlayerStatus.audioFocus`.

- LOSS y LOSS_TRANSIENT pausan la misma sesion.
- DUCK reduce volumen a 0.2.
- GAIN restaura volumen y reanuda solo si la pausa fue causada por foco.
- Pause, completion y release abandonan el foco.

## Evidencia

Logcat registro `requestAudioFocus()` al iniciar y reanudar, y `abandonAudioFocus()` al pausar y completar. No hubo dos clientes de foco del proceso durante el ciclo observado.

## Pendiente fisico

Spotify, llamada, duck/gain externo, Bluetooth y auriculares cableados requieren interaccion/accesorios no disponibles en esta ejecucion. No se certifican por inferencia.
