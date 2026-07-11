import { initialRadioEngineState, radioReducer } from './radio-reducer';
import { isValidRadioPhaseTransition } from '../utils/radio-format';
import { getRadioRealtimeErrorMessage } from '../services/radio-audio-service';

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

  it('keeps live PTT transitions independent from history playback', () => {
    expect(isValidRadioPhaseTransition('READY', 'TRANSMITTING')).toBe(true);
    expect(isValidRadioPhaseTransition('TRANSMITTING', 'READY')).toBe(true);
    expect(isValidRadioPhaseTransition('READY', 'RECEIVING')).toBe(true);
    expect(isValidRadioPhaseTransition('CHANNEL_BUSY', 'READY')).toBe(true);
  });

  it('translates transport failures before they reach the operator', () => {
    expect(getRadioRealtimeErrorMessage('unauthorized')).toBe('Sesion expirada');
    expect(getRadioRealtimeErrorMessage('forbidden')).toBe('Sin permisos para transmitir');
    expect(getRadioRealtimeErrorMessage('transport close')).toBe('Error de conexion');
  });
});
