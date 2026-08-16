import { isAxiosError } from 'axios';
import { apiClient, startRouteSessionRequest, updateRouteSessionStatusRequest } from '@/src/api/client';
import {
  enqueuePendingSyncOperation,
  patchOfflineCachedActiveRouteSession,
} from '@/src/api/offline-cache';
import type { OperationalJourney } from '@shared/operational-contract';
import type { RouteSession } from '@/src/types/app';

export type RouteSessionAction = 'confirm' | 'start' | 'pause' | 'resume' | 'finish';

function isOfflineError(error: unknown) {
  return isAxiosError(error) && !error.response;
}

function canonicalStatusForAction(action: RouteSessionAction) {
  if (action === 'confirm') return 'READY' as const;
  if (action === 'start' || action === 'resume') return 'RUNNING' as const;
  if (action === 'pause') return 'PAUSED' as const;
  return 'FINISHED' as const;
}

async function transitionCanonicalJourney(
  journey: OperationalJourney,
  action: RouteSessionAction,
): Promise<RouteSession> {
  const response = await apiClient.post<{ ok: boolean; data: RouteSession }>(
    `/journeys/${journey.id}/transition`,
    { status: canonicalStatusForAction(action) },
  );
  return response.data.data;
}

export async function executeRouteSessionAction({
  action,
  currentJourney = null,
  currentSession,
  organizationId,
  routeId,
  userId,
  vehicleId,
  driverId,
}: {
  action: RouteSessionAction;
  currentJourney?: OperationalJourney | null;
  currentSession: RouteSession | null;
  organizationId: string;
  routeId: string;
  userId: string;
  vehicleId: string;
  driverId?: string | null;
}): Promise<{ offline: boolean; session: RouteSession | null; record: RouteSession | null }> {
  try {
    if (currentJourney) {
      const session = await transitionCanonicalJourney(currentJourney, action);
      return {
        offline: false,
        session: action === 'finish' ? null : session,
        record: session,
      };
    }

    if (action === 'confirm') {
      throw new Error('No existe una jornada asignada para confirmar');
    }

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

    // Las jornadas ASSIGNED/READY son autoridad del backend. No se simula una
    // confirmacion o un inicio canonico sin que el servidor lo haya aceptado.
    if (currentJourney) throw error;

    const now = new Date().toISOString();
    if (action === 'start') {
      // `startedAt` viaja para que la jornada reconciliada cubra el corte de red.
      // Sin el, el servidor sella el inicio con la hora de reconexion y todos los
      // puntos capturados sin Internet quedan por debajo del inicio de sesion, de
      // modo que el backend los descarta y el recorrido no queda en el historial.
      const pendingSession: RouteSession = {
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
      };
      await enqueuePendingSyncOperation({
        type: 'control:sessionStart',
        payload: { vehicleId, startedAt: now },
      });
      // El caller actualiza Zustand inmediatamente, pero el snapshot offline es
      // la autoridad de hidratacion tras process death. Persistir aqui mantiene
      // UI, cola JS y servicio Android sobre la misma jornada pending.
      await patchOfflineCachedActiveRouteSession(pendingSession);
      return {
        offline: true,
        record: null,
        session: pendingSession,
      };
    }
    if (!currentSession) throw error;
    const status = action === 'finish' ? 'FINISHED' : action === 'pause' ? 'PAUSED' : 'RUNNING';
    const nextSession: RouteSession | null = status === 'FINISHED'
      ? null
      : { ...currentSession, status, updatedAt: now };
    await enqueuePendingSyncOperation({
      type: 'control:sessionStatus',
      payload: { sessionId: currentSession.id.startsWith('pending:') ? null : currentSession.id, vehicleId, status },
    });
    await patchOfflineCachedActiveRouteSession(nextSession);
    return {
      offline: true,
      record: null,
      session: nextSession,
    };
  }
}
