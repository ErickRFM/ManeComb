import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  enqueuePendingSyncOperation,
  loadPendingSyncQueue,
  removePendingSyncOperation,
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
});
