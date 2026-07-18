import { buildOperationalUnitSnapshot } from './build-operational-unit-snapshot';
import type { Incident, RouteSession, Vehicle } from '@/src/types/app';

const vehicle: Vehicle = {
  id: 'vehicle-1',
  code: 'C-1',
  plate: 'ABC-123',
  routeId: 'route-1',
  driverId: 'driver-1',
  supervisorId: null,
  status: 'available',
  occupancy: 0,
  capacity: 18,
  etaMinutes: 12,
  delayMinutes: 0,
  speed: 4,
  fuel: 80,
  updatedAt: '2026-07-17T12:00:00.000Z',
  location: { latitude: 19.3, longitude: -98.2 },
  locationTimestamp: '2026-07-17T11:59:30.000Z',
  gpsFreshness: {
    state: 'fresh',
    isFresh: true,
    thresholdMs: 120000,
    evaluatedAt: '2026-07-17T12:00:00.000Z',
    freshUntil: '2026-07-17T12:01:30.000Z',
  },
  activeRouteProgress: null,
  assignedRoute: null,
  routeName: 'Ruta Centro',
  routeCode: 'RC',
  driverName: 'Ana',
  route: null,
  driver: null,
};

const session: RouteSession = {
  id: 'session-1',
  organizationId: 'org-1',
  routeId: 'route-1',
  vehicleId: 'vehicle-1',
  driverId: 'driver-1',
  startedAt: '2026-07-17T11:30:00.000Z',
  finishedAt: null,
  status: 'RUNNING',
  createdAt: '2026-07-17T11:30:00.000Z',
  updatedAt: '2026-07-17T11:58:00.000Z',
};

const incident: Incident = {
  id: 'incident-1',
  title: 'Tráfico',
  type: 'traffic',
  severity: 'medium',
  status: 'open',
  routeId: 'route-1',
  vehicleId: 'vehicle-1',
  reporterId: 'driver-1',
  description: 'Carga vial',
  createdAt: '2026-07-17T11:57:00.000Z',
  media: [],
};

describe('buildOperationalUnitSnapshot', () => {
  it('prioriza la jornada activa y conserva GPS e incidencias de la misma unidad', () => {
    const snapshot = buildOperationalUnitSnapshot({
      vehicle,
      sessions: [session],
      incidents: [incident],
      allowedActions: ['pause_journey', 'pause_journey', 'finish_journey'],
      now: '2026-07-17T12:00:00.000Z',
    });

    expect(snapshot.status).toEqual({ code: 'running', reason: 'route_session_running' });
    expect(snapshot.gps).toEqual({ state: 'fresh', ageMs: 30000 });
    expect(snapshot.activeJourney?.id).toBe('session-1');
    expect(snapshot.incidents.map((entry) => entry.id)).toEqual(['incident-1']);
    expect(snapshot.actions).toEqual(['pause_journey', 'finish_journey']);
  });

  it('no usa una jornada terminal como estado actual', () => {
    const snapshot = buildOperationalUnitSnapshot({
      vehicle,
      sessions: [{ ...session, status: 'FINISHED', finishedAt: '2026-07-17T12:00:00.000Z' }],
      now: '2026-07-17T12:00:00.000Z',
    });

    expect(snapshot.status.code).toBe('available');
    expect(snapshot.activeJourney).toBeNull();
  });
});
