# Radio Event Flow

| Evento | Autoridad | Efecto canonico |
|---|---|---|
| socket `connect` | socket global | inicia `radio:join`; no publica READY |
| `radio:join` ACK | backend | READY, UNAUTHORIZED o ERROR |
| `radio:start` ACK | backend | TRANSMITTING o CHANNEL_BUSY |
| `radio:start` broadcast | backend | RECEIVING solo para receptores |
| `radio:frame` | transmisor/backend | enqueue PCM en AudioTrack del receptor |
| `radio:end` | backend | libera PTT y vuelve a READY |
| `radio:message:new` | persistencia backend | hidrata historial deduplicado |
| `radio:error` | backend | ERROR en la sesion unica |
| `ManeCombPttFrame` | AudioRecord | envio del frame TX actual |
| `ManeCombPttLevel` | PCM TX o RX | muestra real de waveform PTT |
| `ManeCombPttError` | recurso nativo activo | libera solo captura o playback segun la fase |

El servicio Radio adjunta listeners al socket global y retira exactamente esos callbacks; nunca crea ni desconecta un segundo cliente. `joinGeneration` descarta ACK obsoletos por cambio de canal o reconexion.

`radio:start` es idempotente para el mismo socket y se reintenta una vez si solo vence el ACK. Un ACK exitoso que llega despues de cambiar de canal se libera inmediatamente con `radio:end`. `radio:end` tambien reintenta una vez y considera idempotente `transmission_not_active`.
