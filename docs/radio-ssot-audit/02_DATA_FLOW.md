# Radio Data Flow

## PTT nativo

```text
Pressable -> radio:start ACK -> RadioSession TRANSMITTING
-> AudioRecord PCM16 mono 16 kHz -> frames de 20 ms
-> NativeEventEmitter -> socket global compartido -> backend
-> room autorizada -> receptor -> AudioTrack WRITE_BLOCKING
-> nivel PCM real -> RadioSession RECEIVING -> radio:end -> READY
```

AudioRecord acumula lecturas parciales hasta producir exactamente 640 bytes PCM16 por frame. Mobile, Backend y AudioTrack rechazan cualquier longitud distinta. `sequence` debe ser contigua y `sentAt` finito/positivo; una ruptura invalida la transmision en vez de dejar audio silencioso o corrupto.

El backend concatena el PCM al finalizar, crea WAV, persiste `Message` y emite `radio:message:new`. El Store global hidrata y deduplica por id; la lista consume `messagesByConversation`.

## Historial

```text
Message -> VoiceTransmissionCard -> useAudioPlayer
-> cola serial -> RadioPlayerSession nativa
-> MediaPlayer + Visualizer + AudioFocus
-> PlayerStatus -> texto/progreso/waveform
```

Posicion y duracion preparadas proceden solo de MediaPlayer. La amplitud procede de Visualizer. Antes de prepare se muestra exclusivamente la duracion persistida como metadato; no se usa para calcular progreso.

## Compatibilidad web

Web conserva MediaRecorder y subida HTTP al finalizar. Ese flujo mantiene contratos e historial, pero no es streaming PCM en vivo y no puede certificarse como PTT de baja latencia.
