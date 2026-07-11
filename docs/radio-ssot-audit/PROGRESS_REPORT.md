# Progress

## Fuentes

Despues de prepare:

- `currentPosition`: `MediaPlayer.currentPosition`.
- `durationMillis`: `MediaPlayer.duration`.
- barra: `currentPosition / durationMillis`.

La duracion persistida se usa solo antes de prepare. La tarjeta no usa `Math.max`, `Math.min`, timers de progreso, completion React ni posiciones persistidas.

## Evidencia

La prueba fisica mostro reproduccion en 0:02/0:05, pausa estable en 0:03/0:05, resume desde la misma sesion y completion en 0:00/0:05. El polling es serial y no agenda la siguiente consulta hasta resolver la anterior.

## Pendiente

Seek fisico y comparacion cronometrada con una referencia externa no fueron ejecutados.
