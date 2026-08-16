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
    // Un heartbeat vencido dice desde cuando: "retrasado" a secas no deja al
    // operador juzgar si la unidad sigue siendo confiable.
    expect(formatFreshness(gps({ connectionState: 'delayed', ageSeconds: 9 }))).toBe('GPS retrasado · hace 9 s');
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
    ).toBe('GPS perdido · última ubicación hace 31 s');
  });

  // Una unidad que jamas reporto no esta "vencida" ni "perdida": esta esperando
  // su primer paquete. Es el caso que hacia parecer averiada a una unidad recien
  // dada de alta, y a una unidad con historial reasignada a un conductor nuevo.
  it('distinguishes a unit that has never reported from a unit that lost signal', () => {
    expect(
      formatFreshness(gps({
        connectionState: 'never_reported',
        freshness: 'missing',
        ageSeconds: null,
        lat: null,
        lng: null,
        recordedAt: null,
        receivedAt: null,
      }))
    ).toBe('Esperando primera ubicación');

    // Con historial real, la ultima posicion conocida se conserva y se fecha.
    expect(
      formatFreshness(gps({
        connectionState: 'lost',
        freshness: 'missing',
        ageSeconds: 7_776_000,
      }))
    ).toBe('GPS perdido · última ubicación hace 90 d');
  });

  it('never leaves a never-reported unit looking like a failure', () => {
    expect(connectionOpacity('never_reported')).toBe(connectionOpacity('lost'));
  });
});