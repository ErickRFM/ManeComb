# Duplicate State Report

## D1: selected channel

- Producer A: Store `activeConversationId`.
- Producer B: local `activeChannelId`.
- Arbitration: bootstrap/effects copy values in both directions indirectly.
- Divergence: Store may change before local effect; channel service can remain on the old room briefly.
- Consumers: Store history loader vs Radio PTT service.
- Possible bug: audio history for one channel while PTT is joined to another.

## D2: connection versus authorization

- Producer A: Socket.IO `connect` sets dedicated state to ready.
- Producer B: backend `radio:join` access decision, currently unobserved by client.
- Winner: UI trusts A; `radio:start` later exposes B.
- Proven bug: READY followed by `Radio no disponible`/forbidden on physical APK.

## D3: recording and callback mirror

- Producer A: React `recordingState`.
- Producer B: manually assigned `recordingStateRef`.
- Winner: async callbacks read the ref.
- Divergence risk: direct `setRecordingState` would bypass the ref; current code mostly uses `setRecordingMode`.

## D4: live transmission facts

`isReceivingLive`, `isChannelBusy`, `liveOperator`, and `liveTransmissionIdRef` describe one live session through separate setters. `onStart`, `onEnd`, and `onError` update them sequentially, allowing transient impossible combinations within concurrent events.

## D5: two sockets

They are not duplicate PTT controllers in the current UI. The dedicated socket controls live PTT; the global socket controls persisted history. They still duplicate room membership and authentication transport and must have explicitly separate ownership.

## D6: error presentation

`recorderMessage`, `recordingState`, and `realtimeConnectionState` can each represent failure. `radio:error` writes a message and cleans resources without always moving either state producer to ERROR. The banner can therefore display a failure detail while phase and channel remain READY.
