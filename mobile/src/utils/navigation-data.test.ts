import type { LiveLocationsData } from '@/src/types/app';
import { normalizeLiveLocationsData } from './navigation-data';

describe('navigation data normalization', () => {
  it('keeps Control render-safe when cached vehicles and routes have missing labels', () => {
    const input = {
      updatedAt: '2026-08-06T00:00:00.000Z',
      center: { latitude: 19.4326, longitude: -99.1332 },
      vehicles: [
        {
          id: 'vehicle-1',
          label: 'C-1',
          code: undefined,
          plate: undefined,
          delayMinutes: undefined,
          location: null,
          assignedRoute: null,
          route: null,
        },
      ],
      routes: [
        {
          id: 'route-1',
          name: undefined,
          code: 'R-1',
          color: undefined,
          polyline: undefined,
        },
      ],
      incidents: undefined,
    } as unknown as LiveLocationsData;

    const normalized = normalizeLiveLocationsData(input);

    expect(normalized).not.toBeNull();
    expect(normalized?.vehicles[0].code).toBe('C-1');
    expect(normalized?.routes[0].name).toBe('R-1');
    expect(normalized?.incidents).toEqual([]);
    expect(() =>
      [...(normalized?.vehicles || [])].sort((left, right) => left.code.localeCompare(right.code))
    ).not.toThrow();
    expect(() =>
      [...(normalized?.routes || [])].sort((left, right) => left.name.localeCompare(right.name))
    ).not.toThrow();
  });

  it('uses deterministic fallbacks when identity fields are completely absent', () => {
    const normalized = normalizeLiveLocationsData({
      updatedAt: '2026-08-06T00:00:00.000Z',
      center: { latitude: 19.4326, longitude: -99.1332 },
      vehicles: [{ id: 'vehicle-2', location: null }],
      routes: [{ id: 'route-2', polyline: [] }],
      incidents: [],
    } as unknown as LiveLocationsData);

    expect(normalized?.vehicles[0].code).toBe('Unidad vehicle-2');
    expect(normalized?.routes[0].name).toBe('Ruta 1');
  });
});
