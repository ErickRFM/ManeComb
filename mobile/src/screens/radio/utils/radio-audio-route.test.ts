import { getNextRadioRoute, getRadioRouteIcon, getRadioRouteLabel } from './radio-audio-route';

describe('radio audio route selection', () => {
  it('names every route the operator can see', () => {
    expect(getRadioRouteLabel('bluetooth')).toBe('Bluetooth');
    expect(getRadioRouteLabel('wired')).toBe('Auriculares');
    expect(getRadioRouteLabel('speaker')).toBe('Altavoz');
    expect(getRadioRouteLabel('auto')).toBe('Automatica');
    expect(getRadioRouteIcon('bluetooth')).toBe('bluetooth-audio');
  });

  it('makes every tap change the physical output when Bluetooth is connected', () => {
    const status = {
      active: 'bluetooth' as const,
      requested: 'auto' as const,
      available: ['bluetooth', 'speaker'] as const,
    };

    expect(getNextRadioRoute({ ...status, available: [...status.available] })).toBe('speaker');
    expect(
      getNextRadioRoute({ ...status, requested: 'bluetooth', available: [...status.available] })
    ).toBe('speaker');
    expect(
      getNextRadioRoute({
        ...status,
        active: 'speaker',
        requested: 'speaker',
        available: [...status.available],
      })
    ).toBe('auto');
  });

  it('does not enable a fake route change when only the current output exists', () => {
    expect(
      getNextRadioRoute({ active: 'speaker', requested: 'auto', available: ['speaker'] })
    ).toBeNull();
    expect(getNextRadioRoute({ active: 'speaker', requested: 'auto', available: [] })).toBeNull();
    expect(getNextRadioRoute(null)).toBeNull();
  });

  it('detects wired output as a real alternative', () => {
    expect(
      getNextRadioRoute({
        active: 'speaker',
        requested: 'auto',
        available: ['wired', 'speaker'],
      })
    ).toBe('wired');
  });

  it('recovers from a requested route that disappeared', () => {
    // El accesorio se desconecto: la preferencia vuelve a automatica en lugar
    // de quedarse atascada en una salida inexistente.
    expect(
      getNextRadioRoute({ active: 'speaker', requested: 'bluetooth', available: ['speaker'] })
    ).toBe('auto');
  });
});
