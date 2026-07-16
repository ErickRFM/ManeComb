import type { RouteSession } from '@/src/types/app';
import {
  getSessionDistanceMeters,
  getSessionDurationSeconds,
  selectVehicleActiveSession,
} from './bottom-tracking-panel-data';

function buildSession(overrides: Partial<RouteSession> = {}): RouteSession {
  return {
    id: 'session-1',
    organizationId: 'org-1',
    routeId: 'route-1',
    vehicleId: 'vehicle-1',
    driverId: 'driver-1',
    startedAt: '2026-07-15T12:00:00.000Z',
    finishedAt: null,
    status: 'RUNNING',
    createdAt: '2026-07-15T12:00:00.000Z',
    updatedAt: '2026-07-15T12:00:00.000Z',
    ...overrides,
  };
}

describe('datos de BottomTrackingPanel', () => {
  it('usa la sesion activa cuando corresponde a la unidad seleccionada', () => {
    const active = buildSession();

    expect(selectVehicleActiveSession('vehicle-1', active, [])).toBe(active);
  });

  it('recupera de routeSessionHistory la jornada activa de otra unidad', () => {
    const currentUserSession = buildSession({ vehicleId: 'vehicle-1' });
    const selectedVehicleSession = buildSession({ id: 'session-2', vehicleId: 'vehicle-2' });

    expect(
      selectVehicleActiveSession('vehicle-2', currentUserSession, [selectedVehicleSession])
    ).toBe(selectedVehicleSession);
  });

  it('no usa una jornada finalizada como jornada activa', () => {
    const finished = buildSession({ status: 'FINISHED', finishedAt: '2026-07-15T13:00:00.000Z' });

    expect(selectVehicleActiveSession('vehicle-1', finished, [finished])).toBeNull();
  });

  it('consume distancia y duracion de metrics cuando el agregado principal es nulo', () => {
    const session = buildSession({
      totalDistance: null,
      totalDuration: null,
      metrics: {
        totalDistance: 12_345,
        totalDuration: 3_600,
      },
    });

    expect(getSessionDistanceMeters(session)).toBe(12_345);
    expect(getSessionDurationSeconds(session)).toBe(3_600);
  });
});
