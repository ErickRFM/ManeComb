import { isAxiosError } from 'axios';
import { startRouteSessionRequest, updateRouteSessionStatusRequest } from '@/src/api/client';
import { enqueuePendingSyncOperation } from '@/src/api/offline-cache';
import type { RouteSession } from '@/src/types/app';

export type RouteSessionAction = 'start' | 'pause' | 'resume' | 'finish';

function isOfflineError(error: unknown) {
  return isAxiosError(error) && !error.response;
}

export async function executeRouteSessionAction({
  action,
  currentSession,
  organizationId,
  routeId,
  userId,
  vehicleId,
  driverId,
}: {
  action: RouteSessionAction;
  currentSession: RouteSession | null;
  organizationId: string;
  routeId: string;
  userId: string;
  vehicleId: string;
  driverId?: string | null;
}): Promise<{ offline: boolean; session: RouteSession | null; record: RouteSession | null }> {
  try {
    if (action === 'start') {
      const session = await startRouteSessionRequest(vehicleId);
      return { offline: false, session, record: session };
    }
    if (!currentSession) throw new Error('No existe una jornada activa');
    const status = action === 'finish' ? 'FINISHED' : action === 'pause' ? 'PAUSED' : 'RUNNING';
    const session = await updateRouteSessionStatusRequest(currentSession.id, vehicleId, status);
    return { offline: false, session: status === 'FINISHED' ? null : session, record: session };
  } catch (error) {
    if (!isOfflineError(error)) throw error;
    const now = new Date().toISOString();
    if (action === 'start') {
      await enqueuePendingSyncOperation({ type: 'control:sessionStart', payload: { vehicleId } });
      return {
        offline: true,
        record: null,
        session: {
          id: `pending:${vehicleId}`,
          organizationId,
          routeId,
          vehicleId,
          driverId: driverId || userId,
          startedAt: now,
          finishedAt: null,
          status: 'RUNNING',
          createdAt: now,
          updatedAt: now,
        },
      };
    }
    if (!currentSession) throw error;
    const status = action === 'finish' ? 'FINISHED' : action === 'pause' ? 'PAUSED' : 'RUNNING';
    await enqueuePendingSyncOperation({
      type: 'control:sessionStatus',
      payload: { sessionId: currentSession.id.startsWith('pending:') ? null : currentSession.id, vehicleId, status },
    });
    return {
      offline: true,
      record: null,
      session: status === 'FINISHED' ? null : { ...currentSession, status, updatedAt: now },
    };
  }
}
