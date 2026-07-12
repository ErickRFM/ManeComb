# RADIO - Progress Report

## Flujo vigente

`MediaPlayer.currentPosition` -> bridge `currentPosition` -> `PlayerStatus` -> estado React -> `progress = currentPosition / duration` -> `getProgressBarFill` -> ancho de relleno.

Cada barra recibe `fill = clamp(progress * barCount - index, 0, 1)`. La suma de los 18 rellenos es exactamente `progress * 18`; la barra fronteriza admite relleno parcial. La altura se calcula por separado desde muestras reales del Visualizer.

No existe porcentaje paralelo, completion artificial ni duracion persistida despues de prepare.
