import { getRealtimeSnapshot } from './realtime-state';

describe('realtime state machine', () => {
  it('does not report reconnecting while receiving on a connected socket', () => {
    const snapshot = getRealtimeSnapshot({
      hasUser: true,
      isReceiving: true,
      networkStatus: 'online',
      radioChannelReady: true,
      socketStatus: 'connected',
    });

    expect(snapshot.state).toBe('RECEIVING');
    expect(snapshot.label).toBe('Recibiendo');
    expect(snapshot.canTransmit).toBe(false);
  });

  it('reports reconnecting only when transport or network is recovering', () => {
    const snapshot = getRealtimeSnapshot({
      hasUser: true,
      networkStatus: 'recovering',
      radioChannelReady: true,
      socketStatus: 'connected',
    });

    expect(snapshot.state).toBe('RECONNECTING');
    expect(snapshot.detail).toBe('Reconectando Socket');
  });

  it('does not report connected without a healthy heartbeat', () => {
    const snapshot = getRealtimeSnapshot({
      hasUser: true,
      heartbeatHealthy: false,
      networkStatus: 'online',
      socketStatus: 'connected',
    });
    expect(snapshot.state).toBe('RECONNECTING');
    expect(snapshot.detail).toBe('Esperando heartbeat');
  });
});
