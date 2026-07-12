# Single Source Report

| Hecho | Productor unico | Consumidor visible | Estado |
|---|---|---|---|
| canal activo | Store `activeConversationId` | pantalla/servicio/historial | unico |
| autorizacion | ACK `radio:join` | `RadioSession.phase` | unico |
| sesion PTT | `radioSessionReducer` | consola completa | unico |
| arbitraje | backend `activeRadioTransmissions` | ACK `radio:start` | unico por proceso |
| mensajes | Store deduplicado | FlatList | unico |
| player activo | manager serial + sesion nativa | tarjeta | unico |
| posicion/duracion | MediaPlayer | texto/progreso | unico |
| waveform historial | Visualizer | alturas temporales | unico |
| waveform TX/RX | nivel PCM | consola | unico por fase |
| foco historial/PTT | AudioManager nativo | MediaPlayer/AudioTrack | unico por recurso |

No quedan productores React paralelos para conexion, grabacion, recepcion, canal ocupado u operador. Permanecen limites externos de certificacion: arbitraje distribuido multi-instancia, entrega de socket con JS suspendido y PTT web en vivo.
