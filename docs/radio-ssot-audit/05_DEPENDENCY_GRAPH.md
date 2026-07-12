# Radio Dependency Graph

```text
Store global
|- token/user/networkStatus
|- socket global compartido
|- activeConversationId
`- conversations/messagesByConversation

RadioRealtimeService
|- listeners acotados sobre socket global
|- ACK join/start/end
`- eventos start/frame/end/error

RadioSessionState
|- phase/operator/transmissionId/message
`- unico origen de la consola PTT

Bridge nativo
|- AudioRecord/AudioTrack + AudioFocus PTT
`- MediaPlayer/Visualizer + AudioFocus historial
```

La seleccion del canal se escribe solo mediante `setActiveConversationId`. `loadConversation` carga datos y ya no cambia seleccion. El historial precarga todos los canales ausentes sin alterar el canal activo.

Lifecycle libera suscripciones, timer TX, captura, salida PTT, sesiones de historial y foreground service. `invalidate()` repite la liberacion nativa como ultima barrera.
