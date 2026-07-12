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
  OperationalObservabilitySnapshot,
  AuthRoutingContext,
  RouteSession,
  User,
} from '@/src/types/app';

const CACHE_KEY = 'manecomb:offline-cache:v1';
const QUEUE_KEY = 'manecomb:pending-sync:v1';
const MAX_QUEUE_ITEMS = 2000;

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
  observability: OperationalObservabilitySnapshot | null;
  users: User[];
  activeRouteSession: RouteSession | null;
};

export type PendingSyncOperation =
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
      };
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
  await AsyncStorage.multiRemove([CACHE_KEY, QUEUE_KEY]);
}

export async function loadPendingSyncQueue() {
  return safeJsonParse<PendingSyncOperation[]>(await AsyncStorage.getItem(QUEUE_KEY)) || [];
}

export async function savePendingSyncQueue(queue: PendingSyncOperation[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_ITEMS)));
}

export async function enqueuePendingSyncOperation(
  operation: Omit<PendingSyncOperation, 'id' | 'createdAt' | 'attempts'>
) {
  const queue = await loadPendingSyncQueue();
  const nextOperation = {
    ...operation,
    id: createOperationId(operation.type),
    createdAt: new Date().toISOString(),
    attempts: 0,
  } as PendingSyncOperation;

  await savePendingSyncQueue([...queue, nextOperation]);
  return nextOperation;
}

export async function replacePendingSyncOperation(operation: PendingSyncOperation) {
  const queue = await loadPendingSyncQueue();
  await savePendingSyncQueue(queue.map((entry) => (entry.id === operation.id ? operation : entry)));
}

export async function removePendingSyncOperation(operationId: string) {
  const queue = await loadPendingSyncQueue();
  await savePendingSyncQueue(queue.filter((entry) => entry.id !== operationId));
}
