# Prioritized Refactor Plan

No items in this plan were implemented as part of this documentation phase.

## P0: make authorization authoritative

1. Add and await the existing `radio:join` ACK in `RadioRealtimeService` without changing the public event contract.
2. Set ready only after `{ok:true}`.
3. Map forbidden to unauthorized/error deterministically.
4. Add tests for connect-success/join-forbidden/reconnect-rejoin.

## P0: unify channel selection

1. Select one owner: Store `activeConversationId` for channel identity.
2. Derive `activeChannel` from that owner.
3. Remove local `activeChannelId` and synchronization effects.
4. Drive both history loading and dedicated room membership from the same id.

## P1: atomic live session state

1. Replace receiving/busy/operator/transmission-id setter groups with one event-reduced session object.
2. Model idle, requesting, transmitting, receiving, busy and error with payload ownership.
3. Keep UI phase as a pure selector of that object plus network state.

## P1: serialize playback operations

1. Add one Radio playback coordinator/operation generation at the existing hook boundary.
2. Prevent overlapping status polls.
3. Serialize stop/start across cards while retaining one native session per card.

## P1: harden live audio transport

1. Buffer frames until AudioTrack is prepared.
2. Account for partial nonblocking writes.
3. Expose dropped/written frame diagnostics without displaying fake metrics.

## P2: deployment-safe arbitration

1. Replace process-local channel ownership with shared atomic storage for multi-instance production.
2. Add lease expiry and disconnect recovery.
3. Validate with two backend instances and three clients.

## Exit criteria

- One writable selected channel.
- Ready means authorized room membership.
- One atomic live session state.
- No overlapping player operations or polls.
- One transmitter across backend instances.
- Physical two-device TX/RX/history/reconnect evidence.
