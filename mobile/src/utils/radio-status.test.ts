import { getRadioConnectionStatus } from './radio-status';

describe('radio status', () => {
  it('allows push to talk only when socket is connected', () => {
    expect(getRadioConnectionStatus('connected').canTransmit).toBe(true);
    expect(getRadioConnectionStatus('connected').label).toBe('Conectado a radio');
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
});
