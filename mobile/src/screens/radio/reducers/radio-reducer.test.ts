import { connectionReducer, initialConnectionState } from './connection-reducer';
import { initialRadioEngineState, radioReducer } from './radio-reducer';

describe('radio reducers', () => {
  it('accumulates radio metrics without mutating state', () => {
    const next = radioReducer(initialRadioEngineState, {
      type: 'INCREMENT_METRICS',
      patch: {
        received: 2,
        sent: 1,
        uploadCount: 1,
        uploadTotalMs: 420,
      },
    });

    expect(next.metrics.received).toBe(2);
    expect(next.metrics.sent).toBe(1);
    expect(next.metrics.uploadCount).toBe(1);
    expect(next.metrics.uploadTotalMs).toBe(420);
    expect(initialRadioEngineState.metrics.sent).toBe(0);
  });

  it('tracks invalid connection phase transitions', () => {
    const ready = connectionReducer(initialConnectionState, {
      type: 'RESOLVE_PHASE',
      phase: 'READY',
    });
    const invalid = connectionReducer(ready, {
      type: 'RESOLVE_PHASE',
      phase: 'UPLOADING',
    });

    expect(ready.invalidTransitions).toBe(0);
    expect(invalid.phase).toBe('UPLOADING');
    expect(invalid.invalidTransitions).toBe(1);
  });
});
