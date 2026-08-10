import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  ChatDirectoryContact,
  ChatMessage,
  ConversationSummary,
  DocumentItem,
  GeoPoint,
  Incident,
  LiveLocationsData,
  NotificationItem,
  AuthRoutingContext,
  ProfileMutationPayload,
  RouteSession,
  User,
} from '@/src/types/app';

const CACHE_KEY = 'manecomb:offline-cache:v1';
const QUEUE_KEY = 'manecomb:pending-sync:v1';
const MAX_QUEUE_ITEMS = 2000;
const MAX_LOCATION_QUEUE_AGE_MS = 24 * 60 * 60 * 1000;

export type OfflineCacheSnapshot = {
  savedAt: string;
  authContext: AuthRoutingContext | null;
  user: User | null;
  mapData: LiveLocationsData | null;
  incidents: Incident[];
  conversations: ConversationSummary[];
  chatContacts: ChatDirectoryContact[];
  messagesByConversation: Record<string, ChatMessage[]>;
  documents: DocumentItem[];
  notifications: NotificationItem[];
  users: User[];
  activeRouteSession: RouteSession | null;
  routeSessionHistory: RouteSession[];
};

export type PendingSyncOperation =
  | {
      id: string;
      type: 'control:sessionStart';
      createdAt: string;
      attempts: number;
      payload: { vehicleId: string };
    }
  | {
      id: string;
      type: 'control:sessionStatus';
      createdAt: string;
      attempts: number;
      payload: {
        sessionId?: string | null;
        vehicleId: string;
        status: 'RUNNING' | 'PAUSED' | 'FINISHED' | 'CANCELLED';
      };
    }
  | {
      id: string;
      type: 'incident:create';
      createdAt: string;
      attempts: number;
      payload: {
        title: string;
        type: string;
        description: string;
        severity: string;
      };
    }
  | {
      id: string;
      type: 'incident:updateStatus';
      createdAt: string;
      attempts: number;
      payload: {
        incidentId: string;
        status: 'open' | 'in_progress' | 'resolved';
      };
    }
  | {
      id: string;
      type: 'chat:sendMessage';
      createdAt: string;
      attempts: number;
      payload: {
        conversationId: string;
        text: string;
        clientMessageId?: string;
      };
    }
  | {
      id: string;
      type: 'chat:sendVoice';
      createdAt: string;
      attempts: number;
      payload: {
        conversationId: string;
        fileUri: string;
        fileName: string;
        fileType: string;
        durationSeconds: number;
        caption: string;
      };
    }
  | {
      id: string;
      type: 'chat:sendMedia';
      createdAt: string;
      attempts: number;
      payload: {
        conversationId: string;
        fileUri: string;
        fileName: string;
        fileType: string;
        caption: string;
      };
    }
  | {
      id: string;
      type: 'notification:markRead';
      createdAt: string;
      attempts: number;
      payload: {
        notificationId: string;
      };
    }
  | {
      id: string;
      type: 'user:updateProfile';
      createdAt: string;
      attempts: number;
      payload: ProfileMutationPayload;
    }
  | {
      id: string;
      type: 'vehicle:location';
      createdAt: string;
      attempts: number;
      payload: {
        vehicleId: string;
        coordinates: GeoPoint & {
          accuracy?: number | null;
          heading?: number | null;
          speed?: number | null;
        };
        speed?: number | null;
        heading?: number | null;
        accuracy?: number | null;
        timestamp?: string | null;
        packetId?: string | null;
        sessionId?: string | null;
        clientQueueAgeMs?: number | null;
      };
    };

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function createOperationId(type: string) {
  return `${type}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export function hydratePendingSyncOperationForReplay(
  operation: PendingSyncOperation,
  nowMs = Date.now(),
): PendingSyncOperation {
  if (operation.type !== 'vehicle:location') {
    return operation;
  }

  const createdAtMs = new Date(operation.createdAt).getTime();
  const elapsedMs = Number.isFinite(createdAtMs)
    ? Math.min(MAX_LOCATION_QUEUE_AGE_MS, Math.max(0, nowMs - createdAtMs))
    : 0;

  return {
    ...operation,
    payload: {
      ...operation.payload,
      clientQueueAgeMs: elapsedMs,
    },
  };
}

// AsyncStorage no ofrece una operación read-modify-write atómica. Sin una cola
// local, dos acciones offline concurrentes pueden leer el mismo snapshot y la
// última escritura borra silenciosamente la operación de la otra. Esta cola es
// la autoridad única para mutaciones del pending-sync dentro del proceso.
let pendingSyncMutationTail: Promise<void> = Promise.resolve();

function serializePendingSyncMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const operation = pendingSyncMutationTail.then(mutation, mutation);
  pendingSyncMutationTail = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}

async function readPendingSyncQueueUnsafe() {
  return safeJsonParse<PendingSyncOperation[]>(await AsyncStorage.getItem(QUEUE_KEY)) || [];
}

async function writePendingSyncQueueUnsafe(queue: PendingSyncOperation[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_ITEMS)));
}

export async function loadOfflineCache() {
  return safeJsonParse<OfflineCacheSnapshot>(await AsyncStorage.getItem(CACHE_KEY));
}

export async function saveOfflineCache(snapshot: Omit<OfflineCacheSnapshot, 'savedAt'>) {
  const nextSnapshot: OfflineCacheSnapshot = {
    ...snapshot,
    savedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(nextSnapshot));
  return nextSnapshot;
}

export async function clearOfflineCache() {
  // El snapshot puede limpiarse inmediatamente. La cola, en cambio, debe pasar
  // por la misma exclusión mutua que enqueue/remove/replace para que un write ya
  // iniciado no la resucite después de logout o cambio de tenant.
  await AsyncStorage.removeItem(CACHE_KEY);
  await serializePendingSyncMutation(async () => {
    await AsyncStorage.removeItem(QUEUE_KEY);
  });
}

export async function loadPendingSyncQueue() {
  // Una lectura pública observa únicamente un estado ya confirmado. No debe
  // adelantar una mutación en vuelo y reportar un pendingSyncCount obsoleto.
  // Para GPS, la misma lectura es el boundary de replay: deriva edad de cola a
  // partir de `createdAt` justo antes de enviar, sin confiar en el reloj servidor
  // ni congelar la edad dentro del payload persistido.
  await pendingSyncMutationTail;
  const queue = await readPendingSyncQueueUnsafe();
  const nowMs = Date.now();
  return queue.map((operation) => hydratePendingSyncOperationForReplay(operation, nowMs));
}

export async function savePendingSyncQueue(queue: PendingSyncOperation[]) {
  await serializePendingSyncMutation(async () => {
    await writePendingSyncQueueUnsafe(queue);
  });
}

export async function enqueuePendingSyncOperation(
  operation: Omit<PendingSyncOperation, 'id' | 'createdAt' | 'attempts'>
) {
  return serializePendingSyncMutation(async () => {
    const queue = await readPendingSyncQueueUnsafe();
    const nextOperation = {
      ...operation,
      id: createOperationId(operation.type),
      createdAt: new Date().toISOString(),
      attempts: 0,
    } as PendingSyncOperation;

    await writePendingSyncQueueUnsafe([...queue, nextOperation]);
    return nextOperation;
  });
}

export async function replacePendingSyncOperation(operation: PendingSyncOperation) {
  await serializePendingSyncMutation(async () => {
    const queue = await readPendingSyncQueueUnsafe();
    await writePendingSyncQueueUnsafe(
      queue.map((entry) => (entry.id === operation.id ? operation : entry))
    );
  });
}

export async function removePendingSyncOperation(operationId: string) {
  await serializePendingSyncMutation(async () => {
    const queue = await readPendingSyncQueueUnsafe();
    await writePendingSyncQueueUnsafe(queue.filter((entry) => entry.id !== operationId));
  });
}