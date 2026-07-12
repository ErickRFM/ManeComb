# Radio Render Pipeline

## Historial

```text
MediaPlayer.currentPosition/duration
-> radioPlayerStatusMap
-> normalizePlayerStatus
-> useAudioPlayer state
-> VoiceTransmissionCard
-> texto + getProgressBarFill
```

El polling es recursivo: agenda la siguiente consulta solo despues de resolver la actual. Una generacion descarta respuestas obsoletas. `progress` se obtiene de los campos nativos preparados y cada barra recibe una fraccion entre 0 y 1; no existe coloreo binario cuantizado.

PTT e historial usan `components/radio-waveform.tsx`. Sus barras tienen `flex: 1`, separacion uniforme y ancho total responsive; `mode` solo cambia la altura disponible. El componente recibe exclusivamente muestras y estado visual.

```text
Visualizer waveform bytes
-> pico normalizado nativo
-> PlayerStatus.level
-> segmento temporal segun progress
-> maximo real observado por segmento
-> altura de barra
```

Al cambiar URI o volver a cero se limpia el arreglo temporal. Pausa conserva las alturas y detiene nuevas muestras; completion publica FINISHED, nivel cero y progreso cero.

## Consola PTT

`RadioSession.phase` determina etiqueta, color, bloqueo, operador, timer y animacion. El waveform recibe niveles PCM TX/RX solo cuando la fase correspondiente esta activa. Salir de TRANSMITTING cancela `withRepeat`, devuelve los valores animados a reposo y elimina el intervalo.

## Store

`activeConversationId` selecciona canal. `messagesByConversation` alimenta historial. Cargar conversaciones no cambia seleccion, por lo que render, room y datos no pueden apuntar a canales distintos por efecto de una precarga.
