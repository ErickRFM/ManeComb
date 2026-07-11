# Waveform

## Auditoria

Se elimino la generacion basada en seno/envelope y cualquier patron derivado de hash, duracion o historial. Las 18 barras consumen exclusivamente el nivel actual publicado por el Visualizer nativo. No existe una animacion autonoma.

## Semantica

Las barras representan una muestra instantanea agregada del nivel real, no 18 bandas de frecuencia independientes. Todas reciben la misma amplitud porque el bridge publica un unico `level` normalizado.

## Ciclo

PLAYING: nivel del Visualizer. PAUSED/IDLE/ERROR/RELEASED: cero. El Visualizer se destruye con la sesion MediaPlayer.

## Resultado

No queda waveform decorativa en la tarjeta de historial. La captura fisica mostro actividad durante Play e inactividad durante Pause/Completion.
