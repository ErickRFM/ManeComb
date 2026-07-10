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

  it('updates operational phase in the active radio reducer', () => {
    const ready = radioReducer(initialRadioEngineState, {
      type: 'SET_PHASE',
      phase: 'READY',
    });
    const uploading = radioReducer(ready, {
      type: 'SET_PHASE',
      phase: 'UPLOADING',
    });

    expect(initialRadioEngineState.phase).toBe('IDLE');
    expect(ready.phase).toBe('READY');
    expect(uploading.phase).toBe('UPLOADING');
  });
});
