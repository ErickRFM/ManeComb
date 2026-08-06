import { executeRouteSessionAction } from './route-session-actions';
import { enqueuePendingSyncOperation } from '@/src/api/offline-cache';
import type { OperationalJourney } from '@shared/operational-contract';

const mockPost = jest.fn();

jest.mock('@/src/api/client', () => ({
  apiClient: { post: (...args: unknown[]) => mockPost(...args) },
  startRouteSessionRequest: jest.fn(),
  updateRouteSessionStatusRequest: jest.fn(),
}));

jest.mock('@/src/api/offline-cache', () => ({
  enqueuePendingSyncOperation: jest.fn(),
}));

const baseJourney: OperationalJourney = {
  id: 'journey-1',
  status: 'ASSIGNED',
  driverId: 'driver-1',
  vehicleId: 'vehicle-1',
  routeId: 'route-1',
  scheduledStartAt: '2026-08-07T12:00:00.000Z',
  scheduledEndAt: '2026-08-07T20:00:00.000Z',
  confirmedAt: null,
  confirmedBy: null,
  startedAt: null,
  pausedAt: null,
  resumedAt: null,
  elapsedSeconds: null,
  requiresDriverConfirmation: true,
  canStart: false,
  isDriving: false,
  isPaused: false,
  legacyTiming: { inferredScheduledStartAt: null, reason: null },
};

const params = {
  currentSession: null,
  organizationId: 'org-1',
  routeId: 'route-1',
  userId: 'driver-1',
  vehicleId: 'vehicle-1',
  driverId: 'driver-1',
};

function response(status: 'READY' | 'RUNNING' | 'PAUSED' | 'FINISHED') {
  return {
    data: {
      ok: true,
      data: {
        id: 'journey-1',
        organizationId: 'org-1',
        routeId: 'route-1',
        vehicleId: 'vehicle-1',
        driverId: 'driver-1',
        startedAt: status === 'READY' ? null : '2026-08-07T12:02:00.000Z',
        finishedAt: status === 'FINISHED' ? '2026-08-07T20:00:00.000Z' : null,
        status,
        createdAt: '2026-08-06T12:00:00.000Z',
        updatedAt: '2026-08-07T12:02:00.000Z',
      },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('canonical journey actions', () => {
  it.each([
    ['confirm', 'READY'],
    ['start', 'RUNNING'],
    ['pause', 'PAUSED'],
    ['resume', 'RUNNING'],
    ['finish', 'FINISHED'],
  ] as const)('sends %s through the canonical transition endpoint', async (action, status) => {
    mockPost.mockResolvedValueOnce(response(status));

    const result = await executeRouteSessionAction({
      ...params,
      action,
      currentJourney: {
        ...baseJourney,
        status:
          action === 'start'
            ? 'READY'
            : action === 'pause'
              ? 'RUNNING'
              : action === 'resume' || action === 'finish'
                ? 'PAUSED'
                : 'ASSIGNED',
      },
    });

    expect(mockPost).toHaveBeenCalledWith('/journeys/journey-1/transition', { status });
    expect(result.offline).toBe(false);
    expect(result.record?.status).toBe(status);
    expect(result.session).toBe(action === 'finish' ? null : result.record);
    expect(enqueuePendingSyncOperation).not.toHaveBeenCalled();
  });

  it('does not invent a canonical confirmation while offline', async () => {
    const error = new Error('Network Error') as Error & { isAxiosError?: boolean };
    error.isAxiosError = true;
    mockPost.mockRejectedValueOnce(error);

    await expect(
      executeRouteSessionAction({
        ...params,
        action: 'confirm',
        currentJourney: baseJourney,
      }),
    ).rejects.toThrow('Network Error');

    expect(enqueuePendingSyncOperation).not.toHaveBeenCalled();
  });

  it('rejects confirm when there is no assigned canonical journey', async () => {
    await expect(
      executeRouteSessionAction({
        ...params,
        action: 'confirm',
      }),
    ).rejects.toThrow('No existe una jornada asignada para confirmar');
  });
});
