# WAVEFORM_REPORT

C) Ambas

- Altura del historial: maximo nivel real de Visualizer observado dentro de cada uno de 18 segmentos temporales de la reproduccion actual.
- Altura PTT: historial rodante de niveles reales producidos por AudioRecord/AudioTrack o Web Audio durante la fase activa.
- Color: progreso real `currentPosition / duration` exclusivamente en las tarjetas del historial.
- No quedan senos, hashes, alturas por indice ni un unico nivel replicado en todas las barras activas.
- PTT e historial comparten `RadioWaveform`; el ancho se distribuye con flex y no depende de pixeles fijos.
- El estado vacio no muestra barras simuladas.
