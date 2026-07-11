import { isValidRadioPhaseTransition } from '../utils/radio-format';
import { getRadioRealtimeErrorMessage } from '../services/radio-audio-service';
import { initialRadioSessionState, radioSessionReducer } from './radio-session-reducer';

describe('radio state', () => {
  it('stores phase, authorization, operator and transmission in one session', () => {
    const joining = radioSessionReducer(initialRadioSessionState, {
      type: 'TRANSITION',
      phase: 'JOIN_SENT',
    });
    const ready = radioSessionReducer(joining, {
      type: 'TRANSITION',
      phase: 'READY',
      message: null,
    });
    const transmitting = radioSessionReducer(ready, {
      type: 'TRANSITION',
      phase: 'TRANSMITTING',
      operator: { id: 'operator-1', name: 'Pepe' },
      transmissionId: 'tx-1',
    });

    expect(joining.phase).toBe('JOIN_SENT');
    expect(ready.phase).toBe('READY');
    expect(transmitting).toMatchObject({
      phase: 'TRANSMITTING',
      transmissionId: 'tx-1',
      operator: { id: 'operator-1' },
    });
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
