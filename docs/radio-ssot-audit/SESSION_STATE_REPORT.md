# Session State Report

## Canonical state

`RadioSessionState` in `radio-session-reducer.ts` owns exactly:

- `phase`
- `operator`
- `transmissionId`
- `message`

All changes use the `TRANSITION` action. `radioSessionRef` is a read-only current snapshot for asynchronous native/socket callbacks and is updated by the same transition function; it has no independent setter.

## Removed producers

- `recordingState`
- `isReceivingLive`
- `isChannelBusy`
- `liveOperator`
- `liveTransmissionIdRef`
- `realtimeConnectionState`
- derived `resolvedRadioPhase`

The console, PTT availability, waveform activity, labels, colors, channel indicator and duration now read `radioSession.phase` or another field from the same session object.

## Resource ownership

Session transitions trigger capture/playback operations, while lifecycle cleanup remains responsible for unconditional release on unmount. Media resources are not themselves duplicated into session state.
