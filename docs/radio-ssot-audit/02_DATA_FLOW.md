# Radio Data Flow

## PTT transmit

```text
Pressable
-> requestTransmission (radio:start ACK)
-> AudioRecord, PCM16 mono 16 kHz
-> 320 samples / 640 bytes / 20 ms
-> ManeCombPttFrame + ManeCombPttLevel
-> NativeEventEmitter
-> RadioRealtimeService.sendFrame
-> backend activeRadioTransmissions
-> conversation room
```

## PTT receive

```text
radio:start -> live operator / receiving state -> AudioTrack creation
radio:frame -> base64 decode -> AudioTrack.write
            -> PCM peak -> ManeCombPttLevel -> volumeValue -> WaveBar
radio:end -> AudioTrack pause/flush/stop/release -> READY
```

## Persistence and history

```text
backend finishRadioTransmission
-> concatenate PCM -> WAV -> media storage -> Message
-> radio:message:new
-> global Store hydrate + deduplicate by message.id
-> messagesByConversation
-> loadedVoiceNotes sort by createdAt descending
-> FlatList -> VoiceTransmissionCard
```

REST upload remains a second persistence path for Web notes: `POST /api/radio/messages`. It produces the same Message shape and emits both `chat:message` and `radio:message:new`.

## Visible data sources

| Visible datum | Origin | Update frequency | React dependency |
|---|---|---|---|
| Console label/color | calculated `radioPhase` | any producer update | phase calculation dependencies |
| Channel state | dedicated Socket.IO state | connection events | `realtimeConnectionState` |
| Operator | socket payload | start/busy/end | `liveOperator` |
| PTT duration | `Date.now()` interval | 400 ms | `recordingSeconds` |
| TX/RX waveform | PCM peak | each 20 ms frame | Reanimated `volumeValue` |
| History | Backend Message | REST load/socket event | Store selector |
| Player time | `MediaPlayer.currentPosition` | polling, effective 100 ms | `PlayerStatus` |
| Player duration | `MediaPlayer.duration` | prepare/status | `PlayerStatus` |
| History waveform | Android Visualizer peak | native capture callback/status polling | `PlayerStatus.level` |

## AudioFocus and lifecycle

History playback requests transient AudioFocus before `MediaPlayer.start`, records the focused player id, and abandons focus on pause, completion, release, or module invalidation. PTT `AudioTrack` uses `USAGE_VOICE_COMMUNICATION` but does not use the same explicit focus ownership path.

Entering an authorized channel starts `ManeCombRadioService`; effect cleanup stops it. Component unmount stops capture, playback, players, timers, Web tracks, and the service. Background reception therefore depends on Android retaining the foreground service, active React/Socket execution, and the native AudioTrack path; the code does not prove uninterrupted background JS delivery by itself.

Foreground restoration has no dedicated synchronization event. Socket.IO reconnect and the Store history reload are the recovery mechanisms.
