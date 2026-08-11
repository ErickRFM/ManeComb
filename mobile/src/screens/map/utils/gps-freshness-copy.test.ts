import { connectionOpacity, formatFreshness } from '@shared/operational-contract';
import type { OperationalGps } from '@shared/operational-contract';

function gps(overrides: Partial<OperationalGps>): OperationalGps {
  return {
    lat: 19.31,
    lng: -98.24,
    speedKmh: 0,
    heading: 0,
    recordedAt: '2026-08-10T07:30:00.000Z',
    receivedAt: '2026-08-10T07:30:00.000Z',
    freshness: 'fresh',
    connectionState: 'live',
    ageSeconds: 0,
    ...overrides,
  };
}

describe('GPS freshness copy', () => {
  it('keeps live and delayed states concise', () => {
    expect(formatFreshness(gps({ connectionState: 'live', ageSeconds: 5 }))).toBe('GPS en vivo');
    expect(formatFreshness(gps({ connectionState: 'delayed', ageSeconds: 9 }))).toBe('GPS retrasado');
  });

  it('attenuates a delayed marker before the position becomes stale', () => {
    expect(connectionOpacity('live')).toBe(1);
    expect(connectionOpacity('delayed')).toBeLessThan(connectionOpacity('live'));
    expect(connectionOpacity('stale')).toBeLessThan(connectionOpacity('delayed'));
    expect(connectionOpacity('lost')).toBeLessThan(connectionOpacity('stale'));
  });

  it('makes stale signal loss explicit without hiding the last location', () => {
    expect(
      formatFreshness(gps({
        connectionState: 'stale',
        freshness: 'stale',
        ageSeconds: 16,
      }))
    ).toBe('GPS sin señal · hace 16 s');
  });

  it('makes hard GPS loss explicit and preserves its age', () => {
    expect(
      formatFreshness(gps({
        connectionState: 'lost',
        freshness: 'missing',
        ageSeconds: 31,
      }))
    ).toBe('GPS perdido · hace 31 s');
  });

  it('uses Sin GPS when the unit has never produced a dated position', () => {
    expect(
      formatFreshness(gps({
        connectionState: 'lost',
        freshness: 'missing',
        ageSeconds: null,
        lat: null,
        lng: null,
        recordedAt: null,
        receivedAt: null,
      }))
    ).toBe('Sin GPS');
  });
});