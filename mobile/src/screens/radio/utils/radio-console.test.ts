import { deriveLiveConsole, deriveNoteConsole } from './radio-console';

const baseLive = {
  channelSynced: true,
  errorMessage: null,
  microphoneBlocked: false,
  operator: null,
  selectedChannelTitle: 'General operacion',
};

describe('live radio console', () => {
  it('only enables the PTT when the runtime is listening on the selected channel', () => {
    expect(deriveLiveConsole({ ...baseLive, phase: 'LISTENING' }).pttDisabled).toBe(false);

    for (const phase of [
      'IDLE',
      'JOINING',
      'REQUESTING',
      'RECEIVING',
      'CHANNEL_BUSY',
      'RECONNECTING',
      'PAUSED_BY_CALL',
      'UNAUTHORIZED',
      'ERROR',
    ] as const) {
      expect(deriveLiveConsole({ ...baseLive, phase }).pttDisabled).toBe(true);
    }
  });

  it('marks the channel as switching until the runtime joined the selected channel', () => {
    const console = deriveLiveConsole({ ...baseLive, channelSynced: false, phase: 'LISTENING' });
    expect(console.pttDisabled).toBe(true);
    expect(console.pending).toBe(true);
    expect(console.detail).toContain('General operacion');
  });

  it('names the operator that holds the channel', () => {
    const receiving = deriveLiveConsole({
      ...baseLive,
      operator: { id: 'user-2', name: 'C-03 Erick' },
      phase: 'RECEIVING',
    });
    expect(receiving.detail).toBe('C-03 Erick esta hablando');
    expect(receiving.variant).toBe('busy');

    const busy = deriveLiveConsole({
      ...baseLive,
      operator: { id: 'user-9', name: 'Supervisor' },
      phase: 'CHANNEL_BUSY',
    });
    expect(busy.detail).toContain('Supervisor');
  });

  it('marks capturing only while transmitting', () => {
    expect(deriveLiveConsole({ ...baseLive, phase: 'TRANSMITTING' })).toMatchObject({
      capturing: true,
      variant: 'recording',
      pttDisabled: false,
    });
    expect(deriveLiveConsole({ ...baseLive, phase: 'LISTENING' }).capturing).toBe(false);
  });

  it('offers a retry instead of a dead control when the microphone is blocked', () => {
    const console = deriveLiveConsole({ ...baseLive, microphoneBlocked: true, phase: 'LISTENING' });
    expect(console.pttDisabled).toBe(false);
    expect(console.pttSubtitle).toContain('reintentar');
  });

  it('blocks the console when no channel is selected', () => {
    expect(
      deriveLiveConsole({ ...baseLive, phase: 'LISTENING', selectedChannelTitle: null }).pttDisabled
    ).toBe(true);
  });

  it('surfaces the real error text instead of a generic failure', () => {
    expect(
      deriveLiveConsole({ ...baseLive, errorMessage: 'Canal ocupado', phase: 'ERROR' }).detail
    ).toBe('Canal ocupado');
  });

  it('says the radio is paused by a call rather than broken', () => {
    const console = deriveLiveConsole({ ...baseLive, phase: 'PAUSED_BY_CALL' });
    expect(console.tone).toBe('info');
    expect(console.label).toBe('En llamada');
  });
});

describe('web voice note console', () => {
  const baseNote = {
    errorMessage: null,
    microphoneBlocked: false,
    selectedChannelTitle: 'General operacion',
    supported: true,
  };

  it('never claims to be a live channel', () => {
    const idle = deriveNoteConsole({ ...baseNote, phase: 'IDLE' });
    expect(idle.label).toBe('Nota de voz');
    expect(idle.pttDisabled).toBe(false);
  });

  it('tracks recording and upload as capturing/pending', () => {
    expect(deriveNoteConsole({ ...baseNote, phase: 'RECORDING' })).toMatchObject({
      capturing: true,
      pttDisabled: false,
    });
    expect(deriveNoteConsole({ ...baseNote, phase: 'UPLOADING' })).toMatchObject({
      capturing: false,
      pending: true,
      pttDisabled: true,
    });
  });

  it('disables everything when the browser cannot record', () => {
    expect(deriveNoteConsole({ ...baseNote, phase: 'IDLE', supported: false }).pttDisabled).toBe(true);
  });
});
