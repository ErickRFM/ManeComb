import type { RouteSession } from '@/src/types/app';
import {
  getSessionDistanceMeters,
  getSessionDurationSeconds,
  isFiniteMetricNumber,
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

  it('elige la jornada activa mas reciente aunque el historial llegue desordenado', () => {
    const oldest = buildSession({
      id: 'session-old',
      vehicleId: 'vehicle-2',
      startedAt: '2026-07-15T08:00:00.000Z',
    });
    const newest = buildSession({
      id: 'session-new',
      vehicleId: 'vehicle-2',
      startedAt: '2026-07-15T14:00:00.000Z',
    });

    expect(selectVehicleActiveSession('vehicle-2', null, [oldest, newest])).toBe(newest);
    expect(selectVehicleActiveSession('vehicle-2', null, [newest, oldest])).toBe(newest);
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

  it('acepta cadenas numericas reales pero no convierte vacios o booleanos en cero', () => {
    expect(isFiniteMetricNumber(0)).toBe(true);
    expect(isFiniteMetricNumber('12.5')).toBe(true);
    expect(isFiniteMetricNumber('')).toBe(false);
    expect(isFiniteMetricNumber('   ')).toBe(false);
    expect(isFiniteMetricNumber(false)).toBe(false);
    expect(isFiniteMetricNumber([])).toBe(false);
    expect(isFiniteMetricNumber(Number.NaN)).toBe(false);
  });

  it('no muestra distancia cero cuando el backend envio un valor vacio', () => {
    const session = buildSession({
      totalDistance: '' as unknown as number,
      metrics: { totalDistance: '' as unknown as number },
    });

    expect(getSessionDistanceMeters(session)).toBeNull();
  });
});
