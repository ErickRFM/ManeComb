import type { OperationalUnitSnapshot } from '@shared/operational-contract';
import {
  getActiveRouteCount,
  getMappableUnits,
  getTrackingHudRouteSummary,
  getUnknownStateCount,
  getVisibleUnits,
} from './tracking';

function unit(overrides: Partial<OperationalUnitSnapshot> = {}): OperationalUnitSnapshot {
  return {
    snapshotVersion: 2,
    unitId: 'veh-1',
    plates: 'FBZ-404',
    label: 'C-1',
    status: 'idle',
    operationalState: 'no_route',
    gps: {
      lat: null,
      lng: null,
      speedKmh: null,
      heading: null,
      recordedAt: null,
      receivedAt: null,
      freshness: 'missing',
      connectionState: 'lost',
      ageSeconds: null,
    },
    driver: null,
    route: null,
    session: null,
    incidents: { open: 0, inProgress: 0, lastAt: null },
    lastEventAt: null,
    visibility: 'visible',
    ...overrides,
  };
}

describe('selectores del mapa de seguimiento', () => {
  // El mapa de seguimiento debe dibujar la ultima posicion conocida igual que
  // el mini-mapa de ruta. La frescura cambia como se ve el marcador, nunca si
  // se dibuja.
  it('dibuja una unidad con posicion conocida aunque el GPS no sea fresco', () => {
    const sinFrescura = unit({
      gps: {
        lat: 19.3139,
        lng: -98.2404,
        speedKmh: null,
        heading: null,
        recordedAt: null,
        receivedAt: null,
        freshness: 'missing',
        connectionState: 'lost',
        ageSeconds: null,
      },
      operationalState: 'unknown',
    });

    expect(getMappableUnits([sinFrescura])).toHaveLength(1);
  });

  it('dibuja una unidad con GPS vencido', () => {
    const vencida = unit({
      gps: {
        lat: 19.3139,
        lng: -98.2404,
        speedKmh: null,
        heading: null,
        recordedAt: '2026-07-18T09:00:00.000Z',
        receivedAt: '2026-07-18T09:00:01.000Z',
        freshness: 'stale',
        connectionState: 'lost',
        ageSeconds: 4200,
      },
    });

    expect(getMappableUnits([vencida])).toHaveLength(1);
  });

  it('solo excluye del mapa lo que no tiene coordenada que dibujar', () => {
    expect(getMappableUnits([unit()])).toHaveLength(0);
    // Pero sigue presente en el inventario: no desaparece de listas ni conteos.
    expect(getVisibleUnits([unit()])).toHaveLength(1);
  });

  it('excluye del mapa las unidades ocultas por alta, no por GPS', () => {
    const oculta = unit({
      visibility: 'hidden',
      gps: {
        lat: 19.3139,
        lng: -98.2404,
        speedKmh: 40,
        heading: 90,
        recordedAt: '2026-07-18T10:08:00.000Z',
        receivedAt: '2026-07-18T10:08:01.000Z',
        freshness: 'fresh',
        connectionState: 'live',
        ageSeconds: 5,
      },
    });

    expect(getMappableUnits([oculta])).toHaveLength(0);
  });

  it('no cuenta unknown como en ruta ni lo suma a otro estado', () => {
    const units = [
      unit({ unitId: 'a', operationalState: 'on_route' }),
      unit({ unitId: 'b', operationalState: 'unknown' }),
      unit({ unitId: 'c', operationalState: 'stopped' }),
    ];

    expect(getActiveRouteCount(units)).toBe(1);
    expect(getUnknownStateCount(units)).toBe(1);
  });

  it('presenta 0 activas y 3 sin datos como indicadores separados, nunca como fraccion', () => {
    const summary = getTrackingHudRouteSummary(0, 3);

    expect(summary).toEqual({
      active: { label: 'En ruta', value: '0' },
      unknown: { label: 'Sin datos', value: '3' },
    });
    expect(summary.active.value).not.toContain('/');
    expect(summary.unknown.value).not.toContain('/');
    expect(summary.active.label).not.toBe('Rutas');
  });

  it('normaliza conteos invalidos antes de mostrarlos en el HUD', () => {
    expect(getTrackingHudRouteSummary(-2, Number.NaN)).toEqual({
      active: { label: 'En ruta', value: '0' },
      unknown: { label: 'Sin datos', value: '0' },
    });
    expect(getTrackingHudRouteSummary(2.9, 1.8)).toEqual({
      active: { label: 'En ruta', value: '2' },
      unknown: { label: 'Sin datos', value: '1' },
    });
  });
});
