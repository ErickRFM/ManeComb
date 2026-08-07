import { makeOperationalUnitSnapshot } from './operational-snapshot';

describe('makeOperationalUnitSnapshot', () => {
  it('crea por defecto un snapshot completo de la version canonica actual', () => {
    const snapshot = makeOperationalUnitSnapshot();

    expect(snapshot.snapshotVersion).toBe(2);
    expect(snapshot.journey).toBeNull();
    expect(snapshot.gps).toEqual({
      lat: null,
      lng: null,
      speedKmh: null,
      heading: null,
      recordedAt: null,
      receivedAt: null,
      freshness: 'missing',
      connectionState: 'lost',
      ageSeconds: null,
    });
    expect(snapshot.incidents).toEqual({ open: 0, inProgress: 0, lastAt: null });
  });

  it('mezcla overrides parciales sin perder campos obligatorios anidados', () => {
    const snapshot = makeOperationalUnitSnapshot({
      unitId: 'vehicle-101',
      gps: {
        lat: 19.4326,
        lng: -99.1332,
        freshness: 'fresh',
        connectionState: 'live',
      },
      incidents: { open: 2 },
    });

    expect(snapshot.unitId).toBe('vehicle-101');
    expect(snapshot.gps.lat).toBe(19.4326);
    expect(snapshot.gps.speedKmh).toBeNull();
    expect(snapshot.gps.receivedAt).toBeNull();
    expect(snapshot.incidents).toEqual({ open: 2, inProgress: 0, lastAt: null });
  });
});
