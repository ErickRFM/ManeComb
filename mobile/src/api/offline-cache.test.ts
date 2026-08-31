import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearOfflineCache,
  enqueuePendingSyncOperation,
  hydratePendingSyncOperationForReplay,
  loadOfflineCache,
  loadPendingSyncQueue,
  patchOfflineCachedActiveRouteSession,
  removePendingSyncOperation,
  saveOfflineCache,
  type PendingSyncOperation,
} from './offline-cache';
import type { RouteSession } from '@/src/types/app';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const pendingSession: RouteSession = {
  id: 'pending:vehicle-101',
  organizationId: 'org-1',
  routeId: 'route-1',
  vehicleId: 'vehicle-101',
  driverId: 'driver-1',
  startedAt: '2026-08-15T20:00:00.000Z',
  finishedAt: null,
  status: 'RUNNING',
  createdAt: '2026-08-15T20:00:00.000Z',
  updatedAt: '2026-08-15T20:00:00.000Z',
};

const baseCache = {
  authContext: null,
  user: null,
  mapData: null,
  incidents: [],
  conversations: [],
  chatContacts: [],
  messagesByConversation: {},
  documents: [],
  notifications: [],
  users: [],
  activeRouteSession: null,
  routeSessionHistory: [],
};

describe('cola offline de Control', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('preserva el orden inicio, pausa y finalizacion tras reiniciar', async () => {
    await enqueuePendingSyncOperation({
      type: 'control:sessionStart',
      payload: { vehicleId: 'vehicle-101' },
    });
    await enqueuePendingSyncOperation({
      type: 'control:sessionStatus',
      payload: { sessionId: null, vehicleId: 'vehicle-101', status: 'PAUSED' },
    });
    await enqueuePendingSyncOperation({
      type: 'control:sessionStatus',
      payload: { sessionId: null, vehicleId: 'vehicle-101', status: 'FINISHED' },
    });

    const restored = await loadPendingSyncQueue();
    expect(restored.map((entry) => entry.type)).toEqual([
      'control:sessionStart',
      'control:sessionStatus',
      'control:sessionStatus',
    ]);
    expect(restored[2]).toMatchObject({ payload: { status: 'FINISHED' } });

    await removePendingSyncOperation(restored[0].id);
    expect((await loadPendingSyncQueue()).map((entry) => entry.id)).toEqual([
      restored[1].id,
      restored[2].id,
    ]);
  });

  it('deriva edad de transporte al reproducir una ubicacion offline', () => {
    const queuedAt = Date.parse('2026-08-10T07:00:00.000Z');
    const operation: PendingSyncOperation = {
      id: 'vehicle:location:test',
      type: 'vehicle:location',
      createdAt: new Date(queuedAt).toISOString(),
      attempts: 0,
      payload: {
        vehicleId: 'vehicle-101',
        coordinates: { latitude: 19.31, longitude: -98.24 },
        timestamp: '2026-08-10T01:00:00.000Z',
      },
    };

    const replay = hydratePendingSyncOperationForReplay(operation, queuedAt + 30 * 60 * 1000);
    expect(replay.type).toBe('vehicle:location');
    if (replay.type !== 'vehicle:location') throw new Error('GPS replay perdido');
    expect(replay.payload.clientQueueAgeMs).toBe(30 * 60 * 1000);
    expect(replay.payload.timestamp).toBe(operation.payload.timestamp);
  });

  it('acota edad GPS al mismo horizonte de retencion de 24 horas', () => {
    const queuedAt = Date.parse('2026-08-09T07:00:00.000Z');
    const operation: PendingSyncOperation = {
      id: 'vehicle:location:max-age',
      type: 'vehicle:location',
      createdAt: new Date(queuedAt).toISOString(),
      attempts: 0,
      payload: {
        vehicleId: 'vehicle-101',
        coordinates: { latitude: 19.31, longitude: -98.24 },
      },
    };
    const replay = hydratePendingSyncOperationForReplay(operation, queuedAt + 48 * 60 * 60 * 1000);
    expect(replay.type).toBe('vehicle:location');
    if (replay.type !== 'vehicle:location') throw new Error('GPS replay perdido');
    expect(replay.payload.clientQueueAgeMs).toBe(24 * 60 * 60 * 1000);
  });

  it('no pierde acciones cuando varias se encolan al mismo tiempo', async () => {
    const expectedTexts = Array.from({ length: 32 }, (_, index) => `offline-${index}`);

    await Promise.all(
      expectedTexts.map((text) =>
        enqueuePendingSyncOperation({
          type: 'chat:sendMessage',
          payload: {
            conversationId: 'conversation-concurrent',
            text,
          },
        })
      )
    );

    const restored = await loadPendingSyncQueue();
    const restoredTexts = restored
      .filter((entry) => entry.type === 'chat:sendMessage')
      .map((entry) => entry.payload.text);

    expect(restored).toHaveLength(expectedTexts.length);
    expect(new Set(restoredTexts)).toEqual(new Set(expectedTexts));
  });

  it('conserva una edición normal de perfil para replay offline', async () => {
    await enqueuePendingSyncOperation({
      type: 'user:updateProfile',
      payload: {
        name: 'Empresa Offline',
        phone: '+52 55 0000 0000',
        companyProfile: { companyName: 'Empresa Offline' },
      },
    });

    const restored = await loadPendingSyncQueue();
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({
      type: 'user:updateProfile',
      payload: {
        name: 'Empresa Offline',
        companyProfile: { companyName: 'Empresa Offline' },
      },
    });
  });

  it('sanea y reescribe credenciales de una cola legacy sin perder el perfil válido', async () => {
    await AsyncStorage.setItem('manecomb:pending-sync:v1', JSON.stringify([
      {
        id: 'legacy-profile-password',
        type: 'user:updateProfile',
        createdAt: '2026-08-30T20:00:00.000Z',
        attempts: 1,
        payload: {
          name: 'Empresa Legacy',
          password: 'NuncaPersistir123!',
          currentPassword: 'Actual123!',
          newPassword: 'Nueva123!',
          confirmPassword: 'Nueva123!',
          userStatus: 'suspended',
          companyProfile: { companyName: 'Empresa Legacy', password: 'Nested123!' },
        },
      },
    ]));

    const restored = await loadPendingSyncQueue();
    expect(restored).toEqual([
      expect.objectContaining({
        id: 'legacy-profile-password',
        type: 'user:updateProfile',
        payload: {
          name: 'Empresa Legacy',
          companyProfile: { companyName: 'Empresa Legacy' },
        },
      }),
    ]);

    const persisted = await AsyncStorage.getItem('manecomb:pending-sync:v1');
    expect(persisted).not.toMatch(/NuncaPersistir|Actual123|Nueva123|Nested123/);
    const persistedPayload = JSON.stringify(JSON.parse(persisted || '[]')[0]?.payload || {});
    expect(persistedPayload).not.toMatch(
      /password|currentPassword|newPassword|confirmPassword|userStatus/
    );
  });

  it('elimina una operación legacy que sólo contenía credenciales', async () => {
    await AsyncStorage.setItem('manecomb:pending-sync:v1', JSON.stringify([
      {
        id: 'legacy-only-password',
        type: 'user:updateProfile',
        createdAt: '2026-08-30T20:00:00.000Z',
        attempts: 0,
        payload: { password: 'NuncaPersistir123!' },
      },
    ]));

    expect(await loadPendingSyncQueue()).toEqual([]);
    expect(await AsyncStorage.getItem('manecomb:pending-sync:v1')).toBe('[]');
  });

  it('sanea también una llamada runtime no tipada antes de persistir', async () => {
    await enqueuePendingSyncOperation({
      type: 'user:updateProfile',
      payload: { name: 'Runtime Seguro', password: 'NuncaPersistir123!' },
    } as never);

    const persisted = await AsyncStorage.getItem('manecomb:pending-sync:v1');
    expect(persisted).toContain('Runtime Seguro');
    expect(persisted).not.toMatch(/password|NuncaPersistir/);
  });

  it('serializa remove y enqueue para no resucitar ni borrar operaciones', async () => {
    const first = await enqueuePendingSyncOperation({
      type: 'chat:sendMessage',
      payload: { conversationId: 'conversation-race', text: 'first' },
    });
    await enqueuePendingSyncOperation({
      type: 'chat:sendMessage',
      payload: { conversationId: 'conversation-race', text: 'second' },
    });

    await Promise.all([
      removePendingSyncOperation(first.id),
      enqueuePendingSyncOperation({
        type: 'chat:sendMessage',
        payload: { conversationId: 'conversation-race', text: 'third' },
      }),
    ]);

    const restored = await loadPendingSyncQueue();
    const restoredTexts = restored
      .filter((entry) => entry.type === 'chat:sendMessage')
      .map((entry) => entry.payload.text);

    expect(restoredTexts).toEqual(['second', 'third']);
  });

  it('persiste activeRouteSession sin reemplazar el resto del snapshot', async () => {
    await saveOfflineCache(baseCache);

    await patchOfflineCachedActiveRouteSession(pendingSession);

    const restored = await loadOfflineCache();
    expect(restored?.activeRouteSession).toEqual(pendingSession);
    expect(restored?.incidents).toEqual([]);
    expect(restored?.messagesByConversation).toEqual({});
    expect(restored?.routeSessionHistory).toEqual([]);
    expect(restored?.savedAt).toEqual(expect.any(String));
  });

  it('permite limpiar una jornada offline finalizada sin perder el snapshot', async () => {
    await saveOfflineCache({ ...baseCache, activeRouteSession: pendingSession });

    await patchOfflineCachedActiveRouteSession(null);

    const restored = await loadOfflineCache();
    expect(restored).not.toBeNull();
    expect(restored?.activeRouteSession).toBeNull();
  });

  it('clearOfflineCache actua como barrera contra writes pendientes del snapshot y la cola', async () => {
    await saveOfflineCache(baseCache);
    const pendingPatch = patchOfflineCachedActiveRouteSession(pendingSession);
    const pendingEnqueue = enqueuePendingSyncOperation({
      type: 'incident:create',
      payload: {
        title: 'Incidencia offline',
        type: 'mecanica',
        description: 'Prueba de carrera',
        severity: 'warning',
      },
    });

    const pendingClear = clearOfflineCache();
    await Promise.all([pendingPatch, pendingEnqueue, pendingClear]);

    expect(await loadOfflineCache()).toBeNull();
    expect(await loadPendingSyncQueue()).toEqual([]);
  });
});
