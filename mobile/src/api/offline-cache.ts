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
  SelfProfileMutationPayload,
  RouteSession,
  User,
} from '@/src/types/app';
import {
  hasSelfProfileMutationFields,
  sanitizeSelfProfilePayload,
} from '@/src/api/self-profile-authority';

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
      /**
       * `startedAt` es el instante real en que el conductor inicio la jornada
       * sin Internet. El servidor lo acepta solo hacia el pasado y dentro de la
       * ventana de la cola, para que el historial cubra el corte de red.
       */
      payload: { vehicleId: string; startedAt?: string | null };
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
      payload: SelfProfileMutationPayload;
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

// El snapshot y sus patches parciales comparten la misma exclusión mutua. Sin
// ella, un start/pause offline que persiste activeRouteSession puede competir
// con refreshAll/saveOfflineCache o logout/clearOfflineCache y resucitar estado
// obsoleto después de un process death.
let offlineCacheMutationTail: Promise<void> = Promise.resolve();

function serializeOfflineCacheMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const operation = offlineCacheMutationTail.then(mutation, mutation);
  offlineCacheMutationTail = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}

async function readOfflineCacheUnsafe() {
  return safeJsonParse<OfflineCacheSnapshot>(await AsyncStorage.getItem(CACHE_KEY));
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

function sanitizePendingSyncOperation(
  operation: PendingSyncOperation
): PendingSyncOperation | null {
  if (!operation || typeof operation !== 'object') return null;
  if (operation.type !== 'user:updateProfile') return operation;

  const payload = sanitizeSelfProfilePayload(operation.payload);
  if (!hasSelfProfileMutationFields(payload)) return null;

  return { ...operation, payload };
}

function sanitizePendingSyncQueue(queue: PendingSyncOperation[]) {
  let changed = false;
  const sanitized: PendingSyncOperation[] = [];

  for (const operation of queue) {
    const nextOperation = sanitizePendingSyncOperation(operation);
    if (!nextOperation) {
      changed = true;
      continue;
    }
    if (
      operation.type === 'user:updateProfile'
      && JSON.stringify(operation.payload) !== JSON.stringify(nextOperation.payload)
    ) {
      changed = true;
    }
    sanitized.push(nextOperation);
  }

  return { changed, queue: sanitized };
}

async function persistPendingSyncQueueUnsafe(queue: PendingSyncOperation[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_ITEMS)));
}

async function readPendingSyncQueueUnsafe() {
  const parsed = safeJsonParse<unknown>(await AsyncStorage.getItem(QUEUE_KEY));
  if (!Array.isArray(parsed)) return [];

  const sanitized = sanitizePendingSyncQueue(parsed as PendingSyncOperation[]);
  if (sanitized.changed) {
    await persistPendingSyncQueueUnsafe(sanitized.queue);
  }
  return sanitized.queue;
}

async function writePendingSyncQueueUnsafe(queue: PendingSyncOperation[]) {
  const sanitized = sanitizePendingSyncQueue(queue);
  await persistPendingSyncQueueUnsafe(sanitized.queue);
}

export async function loadOfflineCache() {
  await offlineCacheMutationTail;
  return readOfflineCacheUnsafe();
}

export async function saveOfflineCache(snapshot: Omit<OfflineCacheSnapshot, 'savedAt'>) {
  return serializeOfflineCacheMutation(async () => {
    const nextSnapshot: OfflineCacheSnapshot = {
      ...snapshot,
      savedAt: new Date().toISOString(),
    };

    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(nextSnapshot));
    return nextSnapshot;
  });
}

export async function patchOfflineCachedActiveRouteSession(activeRouteSession: RouteSession | null) {
  return serializeOfflineCacheMutation(async () => {
    const current = await readOfflineCacheUnsafe();
    if (!current) return null;

    const nextSnapshot: OfflineCacheSnapshot = {
      ...current,
      activeRouteSession,
      savedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(nextSnapshot));
    return nextSnapshot;
  });
}

export async function clearOfflineCache() {
  // El snapshot y la cola tienen exclusión mutua independiente. Cada clear se
  // encola detrás de writes ya iniciados para que ninguno pueda resucitar datos
  // después de logout o cambio de tenant.
  await serializeOfflineCacheMutation(async () => {
    await AsyncStorage.removeItem(CACHE_KEY);
  });
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
  const queue = await serializePendingSyncMutation(readPendingSyncQueueUnsafe);
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
    const nextOperation = sanitizePendingSyncOperation({
      ...operation,
      id: createOperationId(operation.type),
      createdAt: new Date().toISOString(),
      attempts: 0,
    } as PendingSyncOperation);
    if (!nextOperation) {
      throw new Error('La actualización de perfil no contiene campos self-service permitidos.');
    }

    await writePendingSyncQueueUnsafe([...queue, nextOperation]);
    return nextOperation;
  });
}

export async function replacePendingSyncOperation(operation: PendingSyncOperation) {
  await serializePendingSyncMutation(async () => {
    const queue = await readPendingSyncQueueUnsafe();
    const sanitizedOperation = sanitizePendingSyncOperation(operation);
    await writePendingSyncQueueUnsafe(
      queue.flatMap((entry) => {
        if (entry.id !== operation.id) return [entry];
        return sanitizedOperation ? [sanitizedOperation] : [];
      })
    );
  });
}

export async function removePendingSyncOperation(operationId: string) {
  await serializePendingSyncMutation(async () => {
    const queue = await readPendingSyncQueueUnsafe();
    await writePendingSyncQueueUnsafe(queue.filter((entry) => entry.id !== operationId));
  });
}
