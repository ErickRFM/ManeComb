# Radio State Graph

Audit target: current working tree. This document describes behavior; it does not certify it.

## Operational state

`radioPhase` is calculated in `radio-screen-view.tsx` from `networkStatus`, `realtimeConnectionState`, `recordingState`, `isReceivingLive`, `isChannelBusy`, and `activeChannel`.

```text
IDLE -> CONNECTING -> READY
READY -> TRANSMITTING -> READY
READY -> RECEIVING -> READY
READY -> CHANNEL_BUSY -> READY
READY/CONNECTING -> RECONNECTING -> READY
* -> OFFLINE
CONNECTING/RECONNECTING -> UNAUTHORIZED
recording error / transport error -> ERROR
TRANSMITTING(web) -> UPLOADING -> READY
```

The transition table in `mobile/src/screens/radio/constants.ts` only validates development logs. It does not prevent transitions.

## Producers and mirrors

| State | Producer | Mirror or duplicate | Destruction |
|---|---|---|---|
| `realtimeConnectionState` | `RadioRealtimeService.onStateChange` | none in Radio UI | service disconnect/unmount |
| `recordingState` | `setRecordingMode` | `recordingStateRef` | idle transition/unmount |
| `radioPhase` | React calculation | `radioPhaseRef` for logging | component unmount |
| `activeChannel` | derived from `activeChannelId` and Store conversations | Store `activeConversationId` | channel change/session reset |
| `isReceivingLive` | PTT `radio:start/end/error` handlers | `liveTransmissionIdRef` partially overlaps | end/error/unmount |
| `isChannelBusy` | `radio:busy/start/end` handlers | `liveOperator` carries related ownership | end/start/unmount |
| player state | native `RadioPlayerSession` | React `PlayerStatus` polling snapshot | card unmount/stop |

## Proven divergence

`ready` means Socket.IO transport connected, not channel authorization confirmed. `radio:join` has no acknowledged result. A physical run displayed READY and then received `forbidden`/`Radio no disponible` from `radio:start`.
