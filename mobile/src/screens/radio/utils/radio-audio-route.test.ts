import { getNextRadioRoute, getRadioRouteIcon, getRadioRouteLabel } from './radio-audio-route';

describe('radio audio route selection', () => {
  it('names every route the operator can see', () => {
    expect(getRadioRouteLabel('bluetooth')).toBe('Bluetooth');
    expect(getRadioRouteLabel('wired')).toBe('Auriculares');
    expect(getRadioRouteLabel('speaker')).toBe('Altavoz');
    expect(getRadioRouteLabel('auto')).toBe('Automatica');
    expect(getRadioRouteIcon('bluetooth')).toBe('bluetooth-audio');
  });

  it('only cycles through outputs that are actually connected', () => {
    const status = {
      active: 'bluetooth' as const,
      requested: 'auto' as const,
      available: ['bluetooth', 'speaker'] as const,
    };

    expect(getNextRadioRoute({ ...status, available: [...status.available] })).toBe('bluetooth');
    expect(
      getNextRadioRoute({ ...status, requested: 'bluetooth', available: [...status.available] })
    ).toBe('speaker');
    expect(
      getNextRadioRoute({ ...status, requested: 'speaker', available: [...status.available] })
    ).toBe('auto');
  });

  it('offers no choice when there is nothing to choose', () => {
    expect(getNextRadioRoute({ active: 'speaker', requested: 'auto', available: [] })).toBeNull();
    expect(getNextRadioRoute(null)).toBeNull();
  });

  it('recovers from a requested route that disappeared', () => {
    // El accesorio se desconecto: el ciclo vuelve al inicio (automatica) en
    // lugar de quedarse atascado en una salida inexistente.
    expect(
      getNextRadioRoute({ active: 'speaker', requested: 'bluetooth', available: ['speaker'] })
    ).toBe('auto');
  });
});
