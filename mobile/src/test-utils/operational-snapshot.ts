import type { OperationalUnitSnapshot } from '@shared/operational-contract';

export type OperationalUnitSnapshotOverrides = Omit<
  Partial<OperationalUnitSnapshot>,
  'gps' | 'incidents'
> & {
  gps?: Partial<OperationalUnitSnapshot['gps']>;
  incidents?: Partial<OperationalUnitSnapshot['incidents']>;
};

const DEFAULT_GPS: OperationalUnitSnapshot['gps'] = {
  lat: null,
  lng: null,
  speedKmh: null,
  heading: null,
  recordedAt: null,
  receivedAt: null,
  freshness: 'missing',
  connectionState: 'lost',
  ageSeconds: null,
};

const DEFAULT_INCIDENTS: OperationalUnitSnapshot['incidents'] = {
  open: 0,
  inProgress: 0,
  lastAt: null,
};

/**
 * Unica factory de snapshots operacionales para pruebas Mobile.
 * Mantiene los fixtures alineados con el contrato compartido y evita que cada
 * suite reconstruya a mano campos obligatorios cuando evoluciona el snapshot.
 */
export function makeOperationalUnitSnapshot(
  overrides: OperationalUnitSnapshotOverrides = {}
): OperationalUnitSnapshot {
  const { gps, incidents, ...snapshotOverrides } = overrides;

  return {
    snapshotVersion: 2,
    unitId: 'vehicle-test',
    plates: null,
    label: 'Unidad de prueba',
    status: 'idle',
    operationalState: 'no_route',
    driver: null,
    route: null,
    session: null,
    journey: null,
    lastEventAt: null,
    visibility: 'visible',
    ...snapshotOverrides,
    gps: {
      ...DEFAULT_GPS,
      ...gps,
    },
    incidents: {
      ...DEFAULT_INCIDENTS,
      ...incidents,
    },
  } satisfies OperationalUnitSnapshot;
}
