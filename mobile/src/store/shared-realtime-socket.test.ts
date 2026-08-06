import {
  SHARED_SOCKET_DISCOVERY_MAX_ATTEMPTS,
  shouldRetrySharedRealtimeSocket,
} from './shared-realtime-socket';

describe('shared realtime socket discovery', () => {
  it('keeps looking for the root socket while an authenticated cold start is connecting', () => {
    expect(
      shouldRetrySharedRealtimeSocket({
        attempt: 0,
        hasSession: true,
        hasSocket: false,
        socketStatus: 'connecting',
      })
    ).toBe(true);
  });

  it('also covers the authenticated idle window before the root store creates the socket', () => {
    expect(
      shouldRetrySharedRealtimeSocket({
        attempt: 0,
        hasSession: true,
        hasSocket: false,
        socketStatus: 'idle',
      })
    ).toBe(true);
  });

  it('stops when the socket appears, the session disappears, or discovery is bounded', () => {
    expect(
      shouldRetrySharedRealtimeSocket({
        attempt: 1,
        hasSession: true,
        hasSocket: true,
        socketStatus: 'connecting',
      })
    ).toBe(false);
    expect(
      shouldRetrySharedRealtimeSocket({
        attempt: 1,
        hasSession: false,
        hasSocket: false,
        socketStatus: 'idle',
      })
    ).toBe(false);
    expect(
      shouldRetrySharedRealtimeSocket({
        attempt: SHARED_SOCKET_DISCOVERY_MAX_ATTEMPTS,
        hasSession: true,
        hasSocket: false,
        socketStatus: 'connecting',
      })
    ).toBe(false);
  });

  it('does not keep polling after an authorization failure', () => {
    expect(
      shouldRetrySharedRealtimeSocket({
        attempt: 0,
        hasSession: true,
        hasSocket: false,
        socketStatus: 'unauthorized',
      })
    ).toBe(false);
  });
});
