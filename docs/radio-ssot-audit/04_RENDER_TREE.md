# Radio Render Tree

```text
RadioScreen
|- cabecera: canal activo + RadioSession.phase
|- canales: conversations + activeConversationId del Store
|- consola PTT
|  |- etiqueta/color/bloqueo: RadioSession.phase
|  |- operador/id: RadioSession
|  |- duracion TX: timer activo solo en TRANSMITTING
|  `- waveform: niveles PCM reales TX/RX
`- historial: messagesByConversation
   `- VoiceTransmissionCard
      |- controles/estado: PlayerStatus
      |- tiempo: MediaPlayer.currentPosition
      |- duracion preparada: MediaPlayer.duration
      |- progreso: currentPosition / duration
      `- alturas: picos Visualizer por segmento temporal
```

No se renderizan barras de senal, RSSI, latencia ni promedios inventados. El color de progreso y la altura de waveform representan magnitudes distintas y tienen productores distintos.
