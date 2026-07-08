import { getRadioConnectionStatus } from './radio-status';

describe('radio status', () => {
  it('allows push to talk only when socket is connected', () => {
    const status = getRadioConnectionStatus('connected', {
      hasUser: true,
      radioChannelReady: true,
    });

    expect(status.canTransmit).toBe(true);
    expect(status.label).toBe('Radio lista');
    expect(status.state).toBe('RADIO_READY');
  });

  it('reports reconnecting without allowing transmission', () => {
    const status = getRadioConnectionStatus('reconnecting');

    expect(status.canTransmit).toBe(false);
    expect(status.label).toBe('Reconectando');
    expect(status.tone).toBe('warning');
  });

  it('blocks transmission when socket is disconnected or errored', () => {
    expect(getRadioConnectionStatus('disconnected').canTransmit).toBe(false);
    expect(getRadioConnectionStatus('error').tone).toBe('danger');
  });

  it('prioritizes receiving over ready when the socket is healthy', () => {
    const status = getRadioConnectionStatus('connected', {
      hasUser: true,
      isReceiving: true,
      radioChannelReady: true,
    });

    expect(status.canTransmit).toBe(false);
    expect(status.label).toBe('Recibiendo');
    expect(status.state).toBe('RECEIVING');
  });
});
