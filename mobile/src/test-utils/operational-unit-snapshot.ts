import type { OperationalUnitSnapshot } from '@shared/operational-contract';

/**
 * Canonical Mobile test fixture for the operational unit contract.
 *
 * Keep contract defaults here instead of duplicating full snapshots in tests.
 * A shared-contract change should fail this factory once, not leave stale
 * fixtures scattered through Mobile.
 */
export function makeOperationalUnitSnapshot(
  overrides: Partial<OperationalUnitSnapshot> = {}
): OperationalUnitSnapshot {
  const snapshot: OperationalUnitSnapshot = {
    snapshotVersion: 2,
    unitId: 'veh-1',
    plates: null,
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
    incidents: {
      open: 0,
      inProgress: 0,
      lastAt: null,
    },
    lastEventAt: null,
    visibility: 'visible',
    ...overrides,
  };

  return snapshot;
}
