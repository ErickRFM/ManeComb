import type { OperationalUnitSnapshot } from '@shared/operational-contract';
import type { Incident, Vehicle } from '@/src/types/app';
import {
  getActiveRouteCount,
  getActiveIncident,
  getMappableUnits,
  getTrackingAudience,
  getTrackingEmptyState,
  getTrackingHudRouteSummary,
  getUnknownStateCount,
  getVisibleIncidents,
  getVisibleUnits,
  resolveTrackingSyncUnit,
  shouldShowDeviceLocationMarker,
} from './tracking';

function unit(overrides: Partial<OperationalUnitSnapshot> = {}): OperationalUnitSnapshot {
  const snapshot: OperationalUnitSnapshot = {
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
    journey: null,
    incidents: { open: 0, inProgress: 0, lastAt: null },
    lastEventAt: null,
    visibility: 'visible',
  };

  return {
    ...snapshot,
    ...overrides,
    journey: overrides.journey ?? snapshot.journey,
  };
}

describe('selectores del mapa de seguimiento', () => {
  const alert = (status: Incident['status'], id: string = status): Incident => ({
    id, status, title: 'Test alert', description: 'Test fixture', severity: 'critical',
    type: 'security', vehicleId: 'veh-1', createdAt: '2026-08-12T16:39:56.039Z',
    routeId: null, reporterId: 'test-reporter', media: [],
    location: { latitude: 19.4, longitude: -99.1 },
  });

  it('keeps resolved vehicle alerts in history but removes their map marker and active alert', () => {
    const resolved = Object.freeze(alert('resolved'));
    const history = Object.freeze([resolved]);
    const vehicles = new Map([['veh-1', { id: 'veh-1' } as Vehicle]]);
    const visible = getVisibleIncidents(history, vehicles);
    expect(visible).toEqual([]);
    expect(getActiveIncident(visible, 0)).toBeNull();
    expect(history).toEqual([resolved]);
    expect(history[0].status).toBe('resolved');
  });

  it('excludes resolved coordinate-only alerts while retaining open and in-progress incidents', () => {
    const resolved = { ...alert('resolved'), vehicleId: null };
    const open = alert('open');
    const attending = alert('in_progress');
    expect(getVisibleIncidents([resolved, open, attending], new Map())).toEqual([open, attending]);
  });

  it('does not resurrect resolved incidents on a fresh history array or map refresh', () => {
    const open = alert('open', 'same-incident');
    expect(getVisibleIncidents([open], new Map())).toHaveLength(1);
    const resolved = { ...open, status: 'resolved' as const };
    for (const history of [[resolved], [{ ...resolved }], [resolved]]) {
      expect(getVisibleIncidents(history, new Map())).toEqual([]);
    }
  });

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

  it('distingue una cuenta administrativa de un conductor sin cambiar autoridad', () => {
    expect(getTrackingAudience('admin')).toBe('fleet');
    expect(getTrackingAudience('owner')).toBe('fleet');
    expect(getTrackingAudience('supervisor')).toBe('fleet');
    expect(getTrackingAudience('driver')).toBe('driver');
    expect(getTrackingAudience('conductor')).toBe('driver');

    expect(getTrackingEmptyState('fleet')).toEqual({
      title: 'Flota sin unidades',
      meta: 'Aún no hay unidades registradas en la empresa',
      statusLabel: 'Flota vacía',
      listLabel: 'Sin unidades registradas',
    });
    expect(getTrackingEmptyState('driver')).toEqual({
      title: 'Sin unidad',
      meta: 'No tienes una unidad asignada',
      statusLabel: 'Sin unidad',
      listLabel: 'Sin unidad asignada',
    });
  });

  it('usa la unidad propia para conductor y la seleccionada para vista de flota', () => {
    const ownUnit = unit({ unitId: 'own' });
    const selectedUnit = unit({ unitId: 'selected' });

    expect(resolveTrackingSyncUnit('driver', ownUnit, selectedUnit)?.unitId).toBe('own');
    expect(resolveTrackingSyncUnit('fleet', null, selectedUnit)?.unitId).toBe('selected');
    expect(resolveTrackingSyncUnit('fleet', ownUnit, selectedUnit)?.unitId).toBe('selected');
  });

  it('no duplica el GPS local cuando ya hay una unidad operativa en el mapa', () => {
    expect(shouldShowDeviceLocationMarker(false, 1)).toBe(false);
    expect(shouldShowDeviceLocationMarker(false, 12)).toBe(false);
    expect(shouldShowDeviceLocationMarker(false, 0)).toBe(true);
    expect(shouldShowDeviceLocationMarker(true, 1)).toBe(true);
  });

  it('presenta incidencias desde Incident[] y usa Vehicle solo para el join estatico', () => {
    const incidents = [
      { id: 'incident-1', vehicleId: 'veh-1', createdAt: '2026-08-15T10:00:00.000Z' },
      { id: 'incident-2', vehicleId: 'missing', createdAt: '2026-08-15T10:01:00.000Z' },
      { id: 'incident-3', location: { latitude: 19.4, longitude: -99.1 }, createdAt: '2026-08-15T10:02:00.000Z' },
    ] as any[];
    const vehicles = new Map([['veh-1', { id: 'veh-1' } as any]]);

    expect(getVisibleIncidents(incidents, vehicles).map((incident) => incident.id)).toEqual([
      'incident-1',
      'incident-3',
    ]);
  });
});
