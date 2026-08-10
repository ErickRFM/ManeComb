import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearOfflineCache,
  enqueuePendingSyncOperation,
  hydratePendingSyncOperationForReplay,
  loadPendingSyncQueue,
  removePendingSyncOperation,
  type PendingSyncOperation,
} from './offline-cache';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

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
    // The device wall clock/capture timestamp is preserved as evidence; replay
    // age is a separate elapsed-duration authority.
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

  it('clearOfflineCache actua como barrera contra writes pendientes de la cola', async () => {
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
    await Promise.all([pendingEnqueue, pendingClear]);

    expect(await loadPendingSyncQueue()).toEqual([]);
  });
});