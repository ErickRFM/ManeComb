# Radio Event Flow

| Event | Producer | Consumer | Cleanup | Finding |
|---|---|---|---|---|
| `connect` | dedicated Socket.IO | set ready, join channel | `removeAllListeners` | ready occurs before join authorization |
| `reconnect_attempt` | Socket.IO manager | set reconnecting | socket destruction | listener removed with manager/socket destruction, not explicitly |
| `connect_error` | Socket.IO | error translation/state | disconnect | unauthorized inferred from message text |
| `radio:join` | client | backend authorization/room join | `radio:leave` | client does not pass ACK, result is unknown |
| `radio:start` request | transmitter | backend arbitration | transmission end/disconnect | ACK is authoritative start decision |
| `radio:start` broadcast | backend | all channel clients | `radio:end` | self event sets operator/id before returning |
| `radio:busy` | backend | busy state/operator | end/start | can coexist briefly with recorder message |
| `radio:frame` | transmitter | backend then receivers | end/disconnect | invalid/out-of-order frames silently dropped |
| `radio:end` | client/backend | resource cleanup | handler | persistence happens after end broadcast |
| `radio:message:new` | backend persistence | global Store | global socket teardown | history update may arrive after READY |
| `radio:error` | backend | recorder message/cleanup | next ready/action | does not always set an ERROR producer |
| `ManeCombPttFrame` | AudioRecord | JS frame sender | subscription remove | 20 ms nominal |
| `ManeCombPttLevel` | AudioRecord or AudioTrack enqueue | Reanimated level | subscription remove | one event name has mutually exclusive TX/RX producers |
| `ManeCombPttError` | native capture | error state/message | subscription remove | capture-only error |

## Event cadence

- Capture frame and TX level: nominally every 20 ms while AudioRecord is active.
- RX level: once for each accepted incoming frame.
- PTT duration timer: every 400 ms.
- Player status: every 100 ms while playing or buffering.
- Socket heartbeat: owned by the global Store socket, not the dedicated PTT socket.
- Completion: native MediaPlayer callback, observed by the next status poll.

Backend disconnect invokes transmission cleanup in `backend/src/sockets/index.js`; active channel ownership is held in the process-local `activeRadioTransmissions` map.
