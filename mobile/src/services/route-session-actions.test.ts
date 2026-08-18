import { executeRouteSessionAction } from './route-session-actions';
import {
  enqueuePendingSyncOperation,
  patchOfflineCachedActiveRouteSession,
} from '@/src/api/offline-cache';

const mockStartRouteSessionRequest = jest.fn();
const mockUpdateRouteSessionStatusRequest = jest.fn();

jest.mock('@/src/api/client', () => ({
  startRouteSessionRequest: (...args: unknown[]) => mockStartRouteSessionRequest(...args),
  updateRouteSessionStatusRequest: (...args: unknown[]) => mockUpdateRouteSessionStatusRequest(...args),
}));

jest.mock('@/src/api/offline-cache', () => ({
  enqueuePendingSyncOperation: jest.fn(),
  patchOfflineCachedActiveRouteSession: jest.fn(),
}));

function offlineError(): Error {
  const err = new Error('Network Error');
  (err as any).isAxiosError = true;
  return err;
}

function serverError(): Error {
  const err = new Error('Internal Server Error');
  (err as any).isAxiosError = true;
  (err as any).response = { status: 500 };
  return err;
}

const defaultParams = {
  organizationId: 'org-1',
  routeId: 'route-1',
  userId: 'user-1',
  vehicleId: 'vehicle-1',
  driverId: 'driver-1',
};

const activeSession = {
  id: 'session-1',
  organizationId: 'org-1',
  routeId: 'route-1',
  vehicleId: 'vehicle-1',
  driverId: 'driver-1',
  startedAt: '2026-07-15T10:00:00.000Z',
  finishedAt: null,
  status: 'RUNNING' as const,
  createdAt: '2026-07-15T10:00:00.000Z',
  updatedAt: '2026-07-15T10:00:00.000Z',
};

const finishedSession = {
  ...activeSession,
  id: 'session-1',
  status: 'FINISHED' as const,
  finishedAt: '2026-07-15T14:00:00.000Z',
  updatedAt: '2026-07-15T14:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('executeRouteSessionAction', () => {
  describe('start', () => {
    it('creates a session online and returns it', async () => {
      const createdSession = { ...activeSession, id: 'session-new' };
      mockStartRouteSessionRequest.mockResolvedValueOnce(createdSession);

      const result = await executeRouteSessionAction({
        action: 'start',
        currentSession: null,
        ...defaultParams,
      });

      expect(mockStartRouteSessionRequest).toHaveBeenCalledWith('vehicle-1');
      expect(patchOfflineCachedActiveRouteSession).not.toHaveBeenCalled();
      expect(result).toEqual({
        offline: false,
        session: createdSession,
        record: createdSession,
      });
    });

    it('creates, persists and enqueues a pending session when offline', async () => {
      mockStartRouteSessionRequest.mockRejectedValueOnce(offlineError());

      const result = await executeRouteSessionAction({
        action: 'start',
        currentSession: null,
        ...defaultParams,
      });

      expect(enqueuePendingSyncOperation).toHaveBeenCalledWith({
        type: 'control:sessionStart',
        payload: { vehicleId: 'vehicle-1', startedAt: expect.any(String) },
      });
      const [[enqueued]] = (enqueuePendingSyncOperation as jest.Mock).mock.calls;
      expect(Number.isNaN(new Date(enqueued.payload.startedAt).getTime())).toBe(false);
      expect(result.offline).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session!.id).toBe('pending:vehicle-1');
      expect(result.session!.startedAt).toBe(enqueued.payload.startedAt);
      expect(result.session!.status).toBe('RUNNING');
      expect(result.record).toBeNull();
      expect(patchOfflineCachedActiveRouteSession).toHaveBeenCalledWith(result.session);
      expect((enqueuePendingSyncOperation as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
        (patchOfflineCachedActiveRouteSession as jest.Mock).mock.invocationCallOrder[0]
      );
    });

    it('re-throws non-offline errors', async () => {
      mockStartRouteSessionRequest.mockRejectedValueOnce(serverError());

      await expect(
        executeRouteSessionAction({
          action: 'start',
          currentSession: null,
          ...defaultParams,
        })
      ).rejects.toThrow('Internal Server Error');
    });
  });

  describe('pause', () => {
    it('pauses a session online', async () => {
      const pausedSession = { ...activeSession, status: 'PAUSED' as const };
      mockUpdateRouteSessionStatusRequest.mockResolvedValueOnce(pausedSession);

      const result = await executeRouteSessionAction({
        action: 'pause',
        currentSession: activeSession,
        ...defaultParams,
      });

      expect(mockUpdateRouteSessionStatusRequest).toHaveBeenCalledWith(
        'session-1', 'vehicle-1', 'PAUSED'
      );
      expect(result).toEqual({
        offline: false,
        session: pausedSession,
        record: pausedSession,
      });
    });

    it('enqueues and persists pause when offline', async () => {
      mockUpdateRouteSessionStatusRequest.mockRejectedValueOnce(offlineError());

      const result = await executeRouteSessionAction({
        action: 'pause',
        currentSession: activeSession,
        ...defaultParams,
      });

      expect(enqueuePendingSyncOperation).toHaveBeenCalledWith({
        type: 'control:sessionStatus',
        payload: { sessionId: 'session-1', vehicleId: 'vehicle-1', status: 'PAUSED' },
      });
      expect(result.offline).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session!.status).toBe('PAUSED');
      expect(result.record).toBeNull();
      expect(patchOfflineCachedActiveRouteSession).toHaveBeenCalledWith(result.session);
    });

    it('re-throws non-offline errors on pause', async () => {
      mockUpdateRouteSessionStatusRequest.mockRejectedValueOnce(serverError());

      await expect(
        executeRouteSessionAction({
          action: 'pause',
          currentSession: activeSession,
          ...defaultParams,
        })
      ).rejects.toThrow('Internal Server Error');
    });
  });

  describe('resume', () => {
    it('resumes a session online', async () => {
      const resumedSession = { ...activeSession, status: 'RUNNING' as const };
      mockUpdateRouteSessionStatusRequest.mockResolvedValueOnce(resumedSession);

      const result = await executeRouteSessionAction({
        action: 'resume',
        currentSession: { ...activeSession, status: 'PAUSED' as const },
        ...defaultParams,
      });

      expect(mockUpdateRouteSessionStatusRequest).toHaveBeenCalledWith(
        'session-1', 'vehicle-1', 'RUNNING'
      );
      expect(result).toEqual({
        offline: false,
        session: resumedSession,
        record: resumedSession,
      });
    });

    it('enqueues and persists resume when offline', async () => {
      const pausedSession = { ...activeSession, status: 'PAUSED' as const };
      mockUpdateRouteSessionStatusRequest.mockRejectedValueOnce(offlineError());

      const result = await executeRouteSessionAction({
        action: 'resume',
        currentSession: pausedSession,
        ...defaultParams,
      });

      expect(enqueuePendingSyncOperation).toHaveBeenCalledWith({
        type: 'control:sessionStatus',
        payload: { sessionId: 'session-1', vehicleId: 'vehicle-1', status: 'RUNNING' },
      });
      expect(result.offline).toBe(true);
      expect(result.session!.status).toBe('RUNNING');
      expect(patchOfflineCachedActiveRouteSession).toHaveBeenCalledWith(result.session);
    });
  });

  describe('finish', () => {
    it('finishes a session online and returns session=null with record', async () => {
      mockUpdateRouteSessionStatusRequest.mockResolvedValueOnce(finishedSession);

      const result = await executeRouteSessionAction({
        action: 'finish',
        currentSession: activeSession,
        ...defaultParams,
      });

      expect(mockUpdateRouteSessionStatusRequest).toHaveBeenCalledWith(
        'session-1', 'vehicle-1', 'FINISHED'
      );
      expect(result).toEqual({
        offline: false,
        session: null,
        record: finishedSession,
      });
    });

    it('enqueues finish, clears cached active session and returns session=null when offline', async () => {
      mockUpdateRouteSessionStatusRequest.mockRejectedValueOnce(offlineError());

      const result = await executeRouteSessionAction({
        action: 'finish',
        currentSession: activeSession,
        ...defaultParams,
      });

      expect(enqueuePendingSyncOperation).toHaveBeenCalledWith({
        type: 'control:sessionStatus',
        payload: { sessionId: 'session-1', vehicleId: 'vehicle-1', status: 'FINISHED' },
      });
      expect(patchOfflineCachedActiveRouteSession).toHaveBeenCalledWith(null);
      expect(result.offline).toBe(true);
      expect(result.session).toBeNull();
      expect(result.record).toBeNull();
    });

    it('finish uses sessionId=null when currentSession is pending', async () => {
      const pendingSession = {
        ...activeSession,
        id: 'pending:vehicle-1',
        status: 'RUNNING' as const,
      };
      mockUpdateRouteSessionStatusRequest.mockRejectedValueOnce(offlineError());

      const result = await executeRouteSessionAction({
        action: 'finish',
        currentSession: pendingSession,
        ...defaultParams,
      });

      expect(enqueuePendingSyncOperation).toHaveBeenCalledWith({
        type: 'control:sessionStatus',
        payload: { sessionId: null, vehicleId: 'vehicle-1', status: 'FINISHED' },
      });
      expect(patchOfflineCachedActiveRouteSession).toHaveBeenCalledWith(null);
      expect(result.offline).toBe(true);
      expect(result.session).toBeNull();
    });

    it('throws when there is no current session for finish', async () => {
      await expect(
        executeRouteSessionAction({
          action: 'finish',
          currentSession: null,
          ...defaultParams,
        })
      ).rejects.toThrow('No existe una jornada activa');

      expect(mockUpdateRouteSessionStatusRequest).not.toHaveBeenCalled();
    });

    it('throws when currentSession is null for pause/resume/finish', async () => {
      for (const action of ['pause', 'resume'] as const) {
        await expect(
          executeRouteSessionAction({
            action,
            currentSession: null,
            ...defaultParams,
          })
        ).rejects.toThrow('No existe una jornada activa');
      }
    });
  });

  describe('offline pending session handling', () => {
    it('enqueues pending sessionId=null and persists next state for pause/resume', async () => {
      const pendingSession: typeof activeSession & { id: string; status: 'RUNNING' } = {
        ...activeSession,
        id: 'pending:vehicle-1',
        status: 'RUNNING' as const,
      };

      for (const status of ['PAUSED', 'RUNNING'] as const) {
        jest.clearAllMocks();
        mockUpdateRouteSessionStatusRequest.mockRejectedValueOnce(offlineError());

        const result = await executeRouteSessionAction({
          action: status === 'PAUSED' ? 'pause' : 'resume',
          currentSession: status === 'PAUSED'
            ? pendingSession
            : { ...pendingSession, status: 'PAUSED' as const },
          ...defaultParams,
        });

        expect(enqueuePendingSyncOperation).toHaveBeenLastCalledWith({
          type: 'control:sessionStatus',
          payload: { sessionId: null, vehicleId: 'vehicle-1', status },
        });
        expect(result.offline).toBe(true);
        expect(result.session?.status).toBe(status);
        expect(patchOfflineCachedActiveRouteSession).toHaveBeenCalledWith(result.session);
      }
    });
  });

  describe('error propagation', () => {
    it('re-throws non-offline errors for pause/resume/finish', async () => {
      mockUpdateRouteSessionStatusRequest.mockRejectedValue(serverError());

      for (const action of ['pause', 'resume', 'finish'] as const) {
        await expect(
          executeRouteSessionAction({
            action,
            currentSession: activeSession,
            ...defaultParams,
          })
        ).rejects.toThrow('Internal Server Error');
      }
    });
  });
});
