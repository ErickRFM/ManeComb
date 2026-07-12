# RADIO - SSOT Render Report

| Elemento | Fuente vigente | SSOT |
|---|---|---:|
| Tiempo | `MediaPlayer.currentPosition` | Si |
| Duracion preparada | `MediaPlayer.duration` | Si |
| Progress | `currentPosition / duration` | Si |
| Waveform historial | picos `Visualizer.level` por segmento temporal | Si |
| Waveform PTT | historial rodante de niveles nativos/Web Audio | Si por plataforma |
| Relleno de progreso | fraccion exacta de `currentPosition / duration` | Si |
| Player phase | estado nativo | Si |
| PTT phase | `RadioSessionState.phase` | Si |
| Canal activo | `activeConversationId` del Store | Si |
| Conexion Radio | socket global compartido + ACK `radio:join` | Si |
| Historial | `messagesByConversation` con deduplicacion por id | Si |

READY solo se publica despues del ACK de `radio:join` o de un `radio:end` valido. Los mensajes temporales ya no cambian la fase mediante timers.
