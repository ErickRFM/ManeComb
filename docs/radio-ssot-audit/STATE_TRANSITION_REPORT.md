# State Transition Report

## Canonical path

```text
IDLE
-> CONNECTING
-> JOIN_SENT
-> READY
-> TRANSMITTING -> READY
-> RECEIVING -> READY
-> CHANNEL_BUSY -> READY
-> OFFLINE
-> RECONNECTING
-> JOIN_SENT
-> READY
```

Alternative join outcomes are UNAUTHORIZED and ERROR. Capture, playback and server persistence errors enter ERROR through the same session reducer.

## Event mapping

| Event | Transition |
|---|---|
| socket connect start | CONNECTING |
| `radio:join` emitted | JOIN_SENT |
| join ACK success | READY |
| join ACK forbidden | UNAUTHORIZED |
| local start/server self start | TRANSMITTING |
| remote `radio:start` | RECEIVING |
| `radio:busy` | CHANNEL_BUSY |
| matching `radio:end` | READY |
| network offline | OFFLINE |
| reconnect attempt/recovery | RECONNECTING |
| capture/server error | ERROR |

## Static validation

Searches return no local channel producer and no state variables named `recordingStateRef`, `isReceivingLive`, `isChannelBusy`, `liveTransmissionIdRef`, `realtimeConnectionState`, or `resolvedRadioPhase`. UI render paths consume the canonical session.
