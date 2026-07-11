# Join ACK Report

## Previous behavior

`connect` triggered `radio:join` without an ACK callback and immediately published ready. A physical test demonstrated READY followed by a forbidden `radio:start`.

## Current behavior

1. Socket connects.
2. Session enters CONNECTING.
3. Service emits `conversation:join` and acknowledged `radio:join`.
4. Session enters JOIN_SENT while waiting.
5. `{ok:true}` produces READY and invokes history reconciliation.
6. `forbidden` or `unauthorized` produces UNAUTHORIZED.
7. timeout or transport failure produces ERROR/RECONNECTING as appropriate.

`radio:start` cannot be requested from the UI while the session is CONNECTING or JOIN_SENT because PTT availability requires an authorized operational phase.

## Stale ACK protection

Each join increments `joinGeneration`. An ACK is ignored when its generation or channel id no longer matches the active request.

## Physical evidence

Release APK tested on OnePlus 9 Pro. The server rejected the channel authorization and every console consumer rendered UNAUTHORIZED / Sesion expirada; READY never appeared. Evidence: `C:/tmp/radio_stabilization_ready.png`.
