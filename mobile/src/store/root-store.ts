import * as SecureStore from '@/src/native/secure-store';
import * as Haptics from '@/src/native/haptics';
import { AppState as NativeAppState, Platform } from 'react-native';
import {
  isAuthoritativeSessionFailure,
  isTransientSessionFailure,
} from './auth-session-failure-policy';
import { logRealtimeDiag } from './realtime-diagnostics-log';
import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import { isAxiosError } from 'axios';
import type { ThemeMode } from '@/constants/theme';
import type { OperationalUnitSnapshot } from '@shared/operational-contract';
import {
  applyIncrementalResourceEvent,
  beginResourceAttempt,
  completeResourceAttempt,
  failResourceAttempt,
  idleResourceState,
  type ResourceState,
} from '@shared/resource-state';
import {
  clearOfflineCache,
  enqueuePendingSyncOperation,
  loadOfflineCache,
  loadPendingSyncQueue,
  removePendingSyncOperation,
  replacePendingSyncOperation,
  saveOfflineCache,
  type OfflineCacheSnapshot,
  type PendingSyncOperation,
} from '@/src/api/offline-cache';
import { APP_VERSION, BUILD_NUMBER } from '@/src/utils/version';
import {
  API_URL,
  SOCKET_URL,
  configureApiSessionRecovery,
  createIncidentRequest,
  forgotPasswordRequest,
  resetPasswordRequest,
  registerDriverActivationRequest,
  getChatContactsRequest,
  getConversationsRequest,
  getDocumentsRequest,
  getE2eeBackupRequest,
  getIncidentsRequest,
  getLastApiTraceId,
  getLocationsRequest,
  getOperationalUnitsRequest,
  getActiveRouteSessionRequest,
  getRouteSessionHistoryRequest,
  getMessagesPageRequest,
  getMessagesRequest,
  getNotificationsRequest,
  getApiErrorMessage,
  getSessionRequest,
  getUsersRequest,
  healthRequest,
  loginRequest,
  logoutRequest,
  markNotificationReadRequest,
  openDirectConversationRequest,
  openGeneralConversationRequest,
  putE2eeBackupRequest,
  registerRequest,
  refreshSessionRequest,
  sendMessageRequest,
  sendMediaMessageRequest,
  sendVoiceMessageRequest,
  setAuthToken,
  startRouteSessionRequest,
  registerPushSubscriptionRequest,
  unregisterPushSubscriptionRequest,
  updateVehicleLocationRequest,
  updateIncidentStatusRequest,
  updateProfileRequest,
  updateRouteSessionStatusRequest,
} from '@/src/api/client';
import {
  getMobileNetworkSnapshot,
  isNetworkReachable,
  mobileLog,
  refreshMobileNetworkSnapshot,
  subscribeMobileNetwork,
  type MobileNetworkSnapshot,
} from '@/src/api/mobile-runtime';
import { hardResetBackgroundLocationServiceAsync } from '@/src/native/background-location';
import type {
  ChatMessage,
  ChatDirectoryContact,
  ConnectionMode,
  ConversationChannelMode,
  ConversationSummary,
  DocumentItem,
  GeoPoint,
  Incident,
  IncidentDraft,
  IncidentStatus,
  AuthRoutingContext,
  LoginResult,
  LiveLocationsData,
  NotificationItem,
  ProfileMutationPayload,
  DriverActivationRegisterPayload,
  RegisterPayload,
  User,
  Vehicle,
  SessionResult,
  RouteSession,
} from '@/src/types/app';
import type { LocationEngineState } from '@/src/screens/map/types/location-engine';
import {
  decryptDirectChatText,
  buildDirectChatMessagePayload,
  decryptStoredChatKeyPairBackup,
  encryptStoredChatKeyPairBackup,
  generateE2eeDeviceId,
  generateStoredChatKeyPair,
  type DirectMessageEnvelope,
  type EncryptedChatKeyBackup,
  isDirectChatEncryptionActive,
  isE2eeCapablePublicKey,
  type StoredChatKeyPair,
} from '@/src/utils/chat-e2ee';
import {
  configureAppNotifications,
  playOperationalAlertFeedback,
  requestAppNotificationPermission,
  requestNativePushToken,
  showInAppNotification,
  type PushRouteIntent,
} from '@/src/utils/push-notifications';
import {
  toOperationalAlertFromNotification,
  toOperationalAlertFromSos,
} from '@/src/utils/operational-alert';
import { normalizeLiveLocationsData, normalizeVehicle } from '@/src/utils/navigation-data';
import { buildPresenceSnapshot, markAllPresenceUnknown, type PresenceMap } from '@/src/utils/presence';
import { beginSessionEpoch, getSessionEpoch, isSessionEpochStale } from '@/src/store/session-epoch';
import {
  isRealtimeAuthError,
  shouldRestartRealtimeAfterForeground,
} from '@/src/utils/realtime-state';
import {
  getForegroundNetworkSignal,
  hasPhysicalNetworkLink,
} from '@/src/utils/network-recovery-policy';
import { createClientMessageId, normalizeClientMessageId } from '@/src/utils/chat-message-id';
import {
  canLoadDirectoryUsers,
  canRefreshOperationalData,
} from '@/src/utils/mobile-authority';
import { shouldAdoptRouteSessionUpdate } from '@/src/store/route-session-reconciliation';
import {
  resolveWebStorage,
  safeWebStorageGetItem,
  safeWebStorageRemoveItem,
  safeWebStorageSetItem,
} from '@/src/store/safe-web-storage';

const TOKEN_KEY = 'combis-session-token';
const REFRESH_TOKEN_KEY = 'combis-refresh-token';
const MODE_KEY = 'combis-session-mode';
const THEME_KEY = 'combis-theme-mode';
const PUSH_TOKEN_KEY = 'combis-push-token';
const E2EE_KEY_PREFIX = 'combis-e2ee-keypair:';
const E2EE_DEVICE_PREFIX = 'combis-e2ee-device:';
const STORAGE_TIMEOUT_MS = 1200;
const SOCKET_HEARTBEAT_MS = 20000;
const SOCKET_ACK_TIMEOUT_MS = 8000;
const SOCKET_MISSED_HEARTBEAT_LIMIT = 3;
const API_HEALTHCHECK_MS = 30000;
const PLAN_REQUIRED_MESSAGE =
  'Necesitas un plan activo para acceder al panel operativo.';

let socket: Socket | null = null;
let socketSessionKey: string | null = null;
let socketHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let apiHealthcheckTimer: ReturnType<typeof setInterval> | null = null;
let networkUnsubscribe: (() => void) | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let pendingSyncInFlight = false;
let recoveryConfigured = false;
let missedHeartbeatAcks = 0;
let socketReconnectAttempts = 0;
let socketAuthRetries = 0;
let realtimeAuthRefreshInFlight: Promise<string | null> | null = null;
let refreshAllInFlight: { epoch: number; promise: Promise<void> } | null = null;
let foregroundRecoveryInFlight: Promise<void> | null = null;

export function getSharedRealtimeSocket() {
  return socket;
}

type ActionResult = {
  ok: boolean;
  message?: string;
};

type ChatPageInfo = {
  hasMore: boolean;
  nextCursor: string | null;
};

type NetworkStatus = 'unknown' | 'online' | 'offline' | 'recovering';
type SocketStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'unauthorized'
  | 'error';

type SocketHeartbeatAck = {
  ok?: boolean;
  packetId?: string;
  serverTime?: string;
  socketId?: string;
  error?: string;
};

type RealtimeDiagnostics = {
  heartbeatLatencyMs: number | null;
  lastPingAt: string | null;
  lastPongAt: string | null;
  lastSocketTransitionAt: string | null;
  missedHeartbeatAcks: number;
  reconnectAttempts: number;
  reason: string | null;
  operationalSocketReceivedAt: string | null;
  operationalAppliedAt: string | null;
  operationalReceiveToApplyMs: number | null;
  operationalUnitId: string | null;
};

export type MobileResourceDomain =
  | 'operationalUnits'
  | 'mapData'
  | 'incidents'
  | 'documents'
  | 'notifications'
  | 'users'
  | 'conversations'
  | 'routeSessionHistory';

const mobileResourceDomains: MobileResourceDomain[] = [
  'operationalUnits', 'mapData', 'incidents', 'documents', 'notifications',
  'users', 'conversations', 'routeSessionHistory',
];

function idleMobileResources(): Record<MobileResourceDomain, ResourceState> {
  return Object.fromEntries(mobileResourceDomains.map((domain) => [domain, idleResourceState()])) as Record<MobileResourceDomain, ResourceState>;
}

export type AppState = {
  apiUrl: string;
  token: string | null;
  refreshToken: string | null;
  sessionPersistence: 'memory' | 'persistent';
  connectionMode: ConnectionMode;
  networkStatus: NetworkStatus;
  socketStatus: SocketStatus;
  realtimeDiagnostics: RealtimeDiagnostics;
  networkSnapshot: MobileNetworkSnapshot | null;
  pendingSyncCount: number;
  lastSyncedAt: string | null;
  lastCacheAt: string | null;
  themeMode: ThemeMode;
  isHydrated: boolean;
  isBootstrapping: boolean;
  isRefreshing: boolean;
  isSubmitting: boolean;
  /**
   * Verdadero desde que arranca `signOut` hasta que la sesion queda limpia. Las
   * pantallas usan este flag para no mostrar estados de sincronizacion mientras
   * la sesion se esta cerrando.
   */
  isSigningOut: boolean;
  accountSuspended: boolean;
  authContext: AuthRoutingContext | null;
  user: User | null;
  mapData: LiveLocationsData | null;
  /**
   * Proyeccion operacional canonica del backend. Fuente unica de estado, GPS,
   * ruta, conductor y ETA. Ninguna pantalla debe derivar esos campos por su
   * cuenta a partir de `mapData`.
   */
  operationalUnits: OperationalUnitSnapshot[];
  resources: Record<MobileResourceDomain, ResourceState>;
  incidents: Incident[];
  conversations: ConversationSummary[];
  chatContacts: ChatDirectoryContact[];
  presenceByUser: Record<string, 'online' | 'offline'>;
  messagesByConversation: Record<string, ChatMessage[]>;
  chatPageInfoByConversation: Record<string, ChatPageInfo>;
  isLoadingOlderChatByConversation: Record<string, boolean>;
  documents: DocumentItem[];
  notifications: NotificationItem[];
  users: User[];
  activeRouteSession: RouteSession | null;
  routeSessionHistory: RouteSession[];
  deviceLocation: LocationEngineState;
  refreshDeviceLocation: () => Promise<void>;
  syncBackgroundLocationCredentials: (token: string, refreshToken: string) => Promise<void>;
  activeConversationId: string | null;
  focusedIncidentId: string | null;
  typingByConversation: Record<string, { userId: string; userName: string; startedAt: number }[]>;
  readByConversation: Record<string, Set<string>>;
  isLoadingConversation: boolean;
  isLoadingChatContacts: boolean;
  error: string | null;
  updateInfo: {
    updateAvailable: boolean;
    latestVersion: string;
    mandatory: boolean;
    releaseNotes: string[];
    downloadUrl: string;
  } | null;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string, rememberSession?: boolean) => Promise<ActionResult>;
  register: (payload: RegisterPayload, rememberSession?: boolean) => Promise<ActionResult>;
  forgotPassword: (email: string) => Promise<ActionResult>;
  resetPassword: (token: string, password: string) => Promise<ActionResult>;
  activateDriverWithKey: (
    payload: DriverActivationRegisterPayload,
    rememberSession?: boolean
  ) => Promise<ActionResult>;
  signOut: () => Promise<void>;
  refreshAll: () => Promise<void>;
  flushPendingSync: () => Promise<void>;
  sendVehicleLocation: (payload: {
    vehicleId: string;
    coordinates: GeoPoint & {
      accuracy?: number | null;
      heading?: number | null;
      speed?: number | null;
    };
    heading?: number | null;
    speed?: number | null;
    timestamp?: string | null;
    packetId?: string | null;
    sessionId?: string | null;
  }) => Promise<ActionResult>;
  loadUsers: () => Promise<void>;
  updateProfile: (payload: ProfileMutationPayload) => Promise<ActionResult>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  loadConversation: (conversationId: string) => Promise<void>;
  loadChatConversation: (conversationId: string) => Promise<void>;
  loadOlderChatMessages: (conversationId: string) => Promise<void>;
  loadChatContacts: () => Promise<void>;
  openDirectConversation: (
    targetUserId: string,
    channelMode?: ConversationChannelMode
  ) => Promise<ConversationSummary | null>;
  openGeneralConversation: (
    channelMode?: ConversationChannelMode,
    options?: { setActive?: boolean }
  ) => Promise<ConversationSummary | null>;
  sendMessage: (conversationId: string, text: string, clientMessageId?: string) => Promise<ActionResult & { messageRecord?: ChatMessage }>;
  sendVoiceMessage: (conversationId: string, formData: FormData) => Promise<ActionResult & { messageRecord?: ChatMessage }>;
  sendMediaMessage: (conversationId: string, formData: FormData) => Promise<ActionResult & { messageRecord?: ChatMessage }>;
  createIncident: (draft: IncidentDraft) => Promise<boolean>;
  updateIncidentStatus: (incidentId: string, status: IncidentStatus) => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  setActiveConversationId: (conversationId: string) => void;
  setFocusedIncidentId: (incidentId: string | null) => void;
  markAsRead: (conversationId: string, messageId: string) => void;
  emitTyping: (conversationId: string, isTyping: boolean) => void;
  handlePushIntent: (intent: PushRouteIntent) => Promise<void>;
  clearError: () => void;
};

type StoreSet = (
  partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)
) => void;

type SessionIdentitySnapshot = {
  epoch: number;
  userId: string | null;
};

function captureSessionIdentity(get: () => AppState): SessionIdentitySnapshot {
  return {
    epoch: getSessionEpoch(),
    userId: get().user?.id || null,
  };
}

function isSessionIdentityCurrent(
  get: () => AppState,
  snapshot: SessionIdentitySnapshot
) {
  const current = get();
  return Boolean(
    snapshot.userId &&
    !isSessionEpochStale(snapshot.epoch) &&
    !current.isSigningOut &&
    current.user?.id === snapshot.userId
  );
}

function getEmptyOperationalState(): Partial<AppState> {
  return {
    mapData: null,
    operationalUnits: [],
    resources: idleMobileResources(),
    incidents: [],
    conversations: [],
    chatContacts: [],
    presenceByUser: {},
    messagesByConversation: {},
    chatPageInfoByConversation: {},
    isLoadingOlderChatByConversation: {},
    documents: [],
    notifications: [],
    users: [],
    activeRouteSession: null,
    routeSessionHistory: [],
    activeConversationId: null,
    focusedIncidentId: null,
    typingByConversation: {},
    readByConversation: {},
    pendingSyncCount: 0,
    lastCacheAt: null,
    lastSyncedAt: null,
    isRefreshing: false,
  };
}

async function clearTenantCache() {
  await clearOfflineCache().catch(() => undefined);
}

async function clearSessionState(set: StoreSet, error: string | null = null) {
  beginSessionEpoch();
  socketAuthRetries = 0;
  cleanupSessionRuntime();
  await hardResetBackgroundLocationServiceAsync().catch(() => undefined);
  setAuthToken(null);
  await persistSession(null, null);
  await clearTenantCache();
  set({
    ...getEmptyOperationalState(),
    token: null,
    refreshToken: null,
    sessionPersistence: 'memory',
    authContext: null,
    user: null,
    isSigningOut: false,
    error,
    updateInfo: null,
    // Cerrar la sesion tambien cierra el arranque. `beginSessionEpoch` de arriba
    // invalida cualquier `initialize`/`refreshAll` en vuelo, y esas tareas
    // retornan sin tocar los flags para no pisar esta autoridad; si no los
    // declaramos aqui, `isBootstrapping` se queda en true y la app se cuelga en
    // el loader de arranque sin ninguna operacion real detras.
    isBootstrapping: false,
    isHydrated: true,
  });
}

function isPlanRequiredError(error: unknown) {
  return isAxiosError(error) &&
    error.response?.status === 403 &&
    error.response?.data?.code === 'PLAN_REQUIRED';
}

function getReadableErrorMessage(
  error: unknown,
  fallbackMessage: string,
  networkSnapshot?: MobileNetworkSnapshot | null
) {
  return getApiErrorMessage(error, fallbackMessage, {
    apiUrl: API_URL,
    hasInternet: networkSnapshot ? isNetworkReachable(networkSnapshot) : null,
  });
}

function getErrorTraceId(error: unknown) {
  if (isAxiosError(error)) {
    const dataTraceId = error.response?.data?.traceId;
    const headerTraceId = error.response?.headers?.['x-trace-id'];
    const traceId = String(dataTraceId || headerTraceId || '').trim();

    if (traceId) {
      return traceId;
    }
  }

  return getLastApiTraceId();
}

function logStoreError(scope: string, error: unknown) {
  const runtime = globalThis as typeof globalThis & { __DEV__?: boolean };
  const shouldLog = runtime.__DEV__ ?? process.env.NODE_ENV !== 'production';

  if (!shouldLog) {
    return;
  }

  const traceId = getErrorTraceId(error);
  const message = getReadableErrorMessage(error, 'Error interno de la aplicación.');

  console.warn(`[store:${scope}] ${message}${traceId ? ` traceId=${traceId}` : ''}`, error);
}

function getWebStorage() {
  return resolveWebStorage(Platform.OS === 'web');
}

async function withStorageTimeout<T>(task: Promise<T>, fallbackValue: T) {
  return await Promise.race([task, new Promise<T>((r) => setTimeout(() => r(fallbackValue), STORAGE_TIMEOUT_MS))]);
}

async function getStoredItem(key: string) {
  const web = getWebStorage();
  if (web) return safeWebStorageGetItem(web, key);
  try { return await withStorageTimeout(SecureStore.getItemAsync(key), null); } catch { return null; }
}

async function setStoredItem(key: string, value: string) {
  const web = getWebStorage();
  if (web) { safeWebStorageSetItem(web, key, value); return; }
  try { await withStorageTimeout(SecureStore.setItemAsync(key, value), undefined); } catch { }
}

async function deleteStoredItem(key: string) {
  const web = getWebStorage();
  if (web) { safeWebStorageRemoveItem(web, key); return; }
  try { await withStorageTimeout(SecureStore.deleteItemAsync(key), undefined); } catch { }
}

async function getStoredChatKeyPair(userId: string) {
  const raw = await getStoredItem(`${E2EE_KEY_PREFIX}${userId}`);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredChatKeyPair;
    return parsed?.publicKey && parsed?.secretKey ? parsed : null;
  } catch {
    return null;
  }
}

async function getOrCreateE2eeDeviceId(userId: string) {
  const storageKey = `${E2EE_DEVICE_PREFIX}${userId}`;
  const stored = await getStoredItem(storageKey);
  if (stored) return stored;

  const deviceId = generateE2eeDeviceId();
  await setStoredItem(storageKey, deviceId);
  return deviceId;
}

async function initializeE2eeIdentity(user: User, password: string) {
  const deviceId = await getOrCreateE2eeDeviceId(user.id);
  let keyPair = await getStoredChatKeyPair(user.id);
  let restored = false;

  if (!keyPair) {
    const remoteBackup = await getE2eeBackupRequest();

    if (remoteBackup?.backupCipher) {
      keyPair = await decryptStoredChatKeyPairBackup({
        backup: JSON.parse(remoteBackup.backupCipher) as EncryptedChatKeyBackup,
        userId: user.id,
        password,
      });
      restored = true;
    } else {
      keyPair = generateStoredChatKeyPair();
    }

    await setStoredItem(`${E2EE_KEY_PREFIX}${user.id}`, JSON.stringify(keyPair));
  }

  const encryptedBackup = await encryptStoredChatKeyPairBackup({
    keyPair,
    userId: user.id,
    password,
    deviceId,
  });
  const updatedUser = await updateProfileRequest({
    e2eePublicKey: keyPair.publicKey,
    e2eeKeyRotatedAt:
      user.e2eePublicKey === keyPair.publicKey && user.e2eeKeyRotatedAt
        ? user.e2eeKeyRotatedAt
        : new Date().toISOString(),
  });

  await putE2eeBackupRequest({
    deviceId,
    publicKey: keyPair.publicKey,
    backupCipher: JSON.stringify(encryptedBackup),
    backupVersion: encryptedBackup.version,
    platform: Platform.OS,
    label: `ManeComb ${Platform.OS}`,
    ...(restored ? { restoredAt: new Date().toISOString() } : {}),
  });

  return updatedUser;
}

async function buildTextMessagePayload(input: {
  conversation: ConversationSummary | null;
  user: User;
  text: string;
}) {
  const keyPair = input.conversation?.kind === 'direct'
    ? await getStoredChatKeyPair(input.user.id)
    : null;
  return buildDirectChatMessagePayload({
    text: input.text,
    currentUserId: input.user.id,
    conversation: input.conversation,
    keyPair,
  });
}

function getMessageCreatedAtTime(message: ChatMessage) {
  const timestamp = new Date(message.createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortConversationMessages(messages: ChatMessage[]) {
  return [...messages].sort((left, right) => {
    const byDate = getMessageCreatedAtTime(left) - getMessageCreatedAtTime(right);
    return byDate || left.id.localeCompare(right.id);
  });
}

function upsertConversationMessage(messagesByConversation: Record<string, ChatMessage[]>, conversationId: string, message: ChatMessage) {
  const current = messagesByConversation[conversationId] || [];
  return {
    ...messagesByConversation,
    [conversationId]: mergeConversationMessages(current, [message]),
  };
}

function getKnownPresenceUserIds(state: AppState) {
  return [
    state.user?.id,
    ...state.users.map((entry) => entry.id),
    ...state.chatContacts.map((entry) => entry.id),
    ...state.conversations.flatMap((entry) => entry.participants.map((participant) => participant.id)),
    ...Object.values(state.messagesByConversation).flatMap((messages) =>
      messages.map((message) => message.sender?.id).filter(Boolean)
    ),
  ].filter((value): value is string => Boolean(value));
}

function applyPresenceToLoadedEntities(state: AppState, presenceByUser: PresenceMap) {
  const statusFor = (userId: string) => presenceByUser[userId] || 'offline';
  return {
    presenceByUser,
    chatContacts: state.chatContacts.map((contact) => ({ ...contact, status: statusFor(contact.id) })),
    conversations: state.conversations.map((conversation) => ({
      ...conversation,
      participants: conversation.participants.map((participant) => ({
        ...participant,
        status: statusFor(participant.id),
      })),
    })),
    messagesByConversation: Object.fromEntries(
      Object.entries(state.messagesByConversation).map(([conversationId, messages]) => [
        conversationId,
        messages.map((message) => message.sender ? {
          ...message,
          sender: { ...message.sender, status: statusFor(message.sender.id) },
        } : message),
      ])
    ),
  };
}

function upsertIncident(incidents: Incident[], incident: Incident) {
  const next = incidents.some((entry) => entry.id === incident.id)
    ? incidents.map((entry) => (entry.id === incident.id ? incident : entry))
    : [incident, ...incidents];

  return next.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function enrichIncidentFromState(state: AppState, incident: Incident): Incident {
  const vehicle = incident.vehicle || state.mapData?.vehicles.find((entry) => entry.id === incident.vehicleId) || null;
  const route = incident.route || state.mapData?.routes.find((entry) => entry.id === incident.routeId) || null;

  return {
    ...incident,
    route,
    vehicle,
  };
}

function applyIncidentToMapData(mapData: LiveLocationsData | null, incident: Incident) {
  if (!mapData) {
    return mapData;
  }

  const incidents =
    incident.status === 'resolved'
      ? mapData.incidents.filter((entry) => entry.id !== incident.id)
      : upsertIncident(mapData.incidents, incident);

  return {
    ...mapData,
    incidents,
    updatedAt: new Date().toISOString(),
  };
}

function mergeConversationMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const messagesById = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => messagesById.set(message.id, message));
  return sortConversationMessages([...messagesById.values()]);
}

function sortConversations(conversations: ConversationSummary[]) {
  return [...conversations].sort((a, b) => {
    const da = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const db = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return db - da || a.title.localeCompare(b.title);
  });
}

function upsertConversation(conversations: ConversationSummary[], next: ConversationSummary) {
  const exists = conversations.some((c) => c.id === next.id);
  return sortConversations(exists ? conversations.map((c) => (c.id === next.id ? { ...c, ...next } : c)) : [next, ...conversations]);
}

async function persistSession(
  token: string | null,
  mode: ConnectionMode | null,
  refreshToken?: string | null
) {
  if (!token || !mode) {
    await deleteStoredItem(TOKEN_KEY);
    await deleteStoredItem(REFRESH_TOKEN_KEY);
    await deleteStoredItem(MODE_KEY);
    return;
  }
  await setStoredItem(TOKEN_KEY, token);
  await setStoredItem(MODE_KEY, mode);
  if (refreshToken) {
    await setStoredItem(REFRESH_TOKEN_KEY, refreshToken);
  } else {
    await deleteStoredItem(REFRESH_TOKEN_KEY);
  }
}

function isProbablyNetworkError(error: unknown) {
  if (!isAxiosError(error)) {
    return false;
  }

  return (
    !error.response ||
    error.message === 'Network Error' ||
    error.code === 'ERR_NETWORK' ||
    error.code === 'ECONNABORTED' ||
    /network|timeout|aborted/i.test(error.message || '')
  );
}

function buildCacheSnapshot(state: AppState): Omit<OfflineCacheSnapshot, 'savedAt'> {
  return {
    authContext: state.authContext,
    user: state.user,
    mapData: normalizeLiveLocationsData(state.mapData),
    incidents: state.incidents,
    conversations: state.conversations,
    chatContacts: state.chatContacts,
    messagesByConversation: state.messagesByConversation,
    documents: state.documents,
    notifications: state.notifications,
    users: state.users,
    activeRouteSession: state.activeRouteSession,
    routeSessionHistory: state.routeSessionHistory,
  };
}

function stateFromCache(snapshot: OfflineCacheSnapshot | null): Partial<AppState> {
  if (!snapshot) {
    return {};
  }

  const cachedAt = snapshot.savedAt || new Date().toISOString();
  const resources = idleMobileResources();
  for (const domain of mobileResourceDomains) {
    resources[domain] = {
      status: 'stale',
      isRefreshing: false,
      lastAttemptAt: null,
      lastSuccessfulAt: cachedAt,
      source: 'cache',
      errorCode: null,
      errorMessage: null,
    };
  }
  return {
    authContext: snapshot.authContext || null,
    user: snapshot.user,
    mapData: normalizeLiveLocationsData(snapshot.mapData),
    incidents: snapshot.incidents || [],
    conversations: sortConversations(snapshot.conversations || []),
    chatContacts: snapshot.chatContacts || [],
    messagesByConversation: snapshot.messagesByConversation || {},
    documents: snapshot.documents || [],
    notifications: snapshot.notifications || [],
    users: snapshot.users || [],
    activeRouteSession: snapshot.activeRouteSession || null,
    routeSessionHistory: snapshot.routeSessionHistory || [],
    resources,
    lastCacheAt: snapshot.savedAt,
  };
}

function getAuthContextFromPayload(
  payload: Partial<LoginResult & SessionResult> | null | undefined
): AuthRoutingContext | null {
  if (!payload) {
    return null;
  }

  if (payload.authContext) {
    const canAccessMobile = payload.authContext.canAccessMobile ?? payload.canAccessMobile;
    const mobileBlockReason: AuthRoutingContext['mobileBlockReason'] =
      payload.authContext.mobileBlockReason ??
      payload.mobileBlockReason ??
      (canAccessMobile === false ? 'sync_error' : null);

    return {
      ...payload.authContext,
      accountChannel:
        payload.authContext.accountChannel ??
        payload.accountChannel ??
        payload.user?.accountChannel ??
        payload.profile?.user?.accountChannel,
      accountChannelReason:
        payload.authContext.accountChannelReason ??
        payload.accountChannelReason ??
        payload.user?.accountChannelReason ??
        payload.profile?.user?.accountChannelReason ??
        null,
      canAccessMobile,
      canAccessPortal:
        payload.authContext.canAccessPortal ?? payload.canAccessPortal ?? false,
      canUseOperations:
        payload.authContext.canUseOperations ?? payload.canUseOperations ?? false,
      mobileBlockReason,
      operationalBlockReason:
        payload.authContext.operationalBlockReason ??
        payload.operationalBlockReason ??
        null,
      productDestination:
        payload.authContext.productDestination ??
        payload.productDestination ??
        payload.authContext.destination,
      productRoute:
        payload.authContext.productRoute ??
        payload.productRoute ??
        payload.postLoginRoute ??
        payload.authContext.route,
    };
  }

  if (typeof payload.canAccessMobile === 'boolean') {
    const canAccessMobile = payload.canAccessMobile === true;
    const accountChannel =
      payload.accountChannel ??
      payload.user?.accountChannel ??
      payload.profile?.user?.accountChannel ??
      (canAccessMobile ? 'mobile_operations' : undefined);
    const mobileBlockReason: AuthRoutingContext['mobileBlockReason'] =
      payload.mobileBlockReason ?? (canAccessMobile ? null : 'sync_error');

    return {
      accountChannel,
      accountChannelReason: payload.accountChannelReason ?? null,
      canAccessMobile,
      canAccessPortal: payload.canAccessPortal ?? accountChannel === 'company_portal',
      canUseOperations: payload.canUseOperations ?? canAccessMobile,
      destination: canAccessMobile ? 'HomeOperativo' : 'PlanBlocked',
      mobileBlockReason,
      onboarding: payload.onboarding || null,
      operationalBlockReason: payload.operationalBlockReason ?? null,
      productDestination: payload.productDestination ?? (canAccessMobile ? 'HomeOperativo' : 'PlanBlocked'),
      productRoute: payload.productRoute ?? payload.postLoginRoute ?? (canAccessMobile ? '/mapa' : '/plan-blocked'),
      route: canAccessMobile ? '/mapa' : '/plan-blocked',
      subscription: payload.subscription || null,
      tenant: payload.tenant || null,
    };
  }

  return null;
}

function shouldRefreshOperationalData(
  authContext: AuthRoutingContext | null | undefined,
  user: User | null | undefined
) {
  return canRefreshOperationalData(authContext, user);
}

async function refreshAuthSession(set: StoreSet, epoch?: number) {
  const session = await getSessionRequest();
  const authContext = getAuthContextFromPayload(session);

  if (typeof epoch === 'number' && isSessionEpochStale(epoch)) {
    return { authContext, session };
  }

  set({
    authContext,
    documents: session.profile.documents,
    user: session.profile.user,
  });

  return {
    authContext,
    session,
  };
}

async function replaceSessionFromBackend(
  set: StoreSet,
  get: () => AppState,
  token: string,
  refreshToken: string | null | undefined,
  rememberSession: boolean
) {
  // Re-armar el runtime de recuperacion (poller de healthcheck + listeners de
  // red/app-state) en cada establecimiento de sesion. `cleanupSessionRuntime`
  // lo desmonta en signOut/expiracion, y sin volver a montarlo un login sin
  // reiniciar la app dejaria al ConnectionBanner sin quien lo recupere: se
  // quedaria en "Servidor no disponible" hasta cerrar la app. Es idempotente.
  configureMobileRuntime(set, get);
  await hardResetBackgroundLocationServiceAsync().catch(() => undefined);
  await clearTenantCache();
  setAuthToken(token);

  const sessionPersistence = rememberSession ? 'persistent' : 'memory';
  set({ sessionPersistence });

  if (rememberSession) {
    await persistSession(token, 'online', refreshToken);
  } else {
    await persistSession(null, null);
  }

  const session = await getSessionRequest();
  const authContext = getAuthContextFromPayload(session);

  set({
    ...getEmptyOperationalState(),
    authContext,
    documents: session.profile.documents,
    networkStatus: 'online',
    refreshToken: refreshToken || null,
    sessionPersistence,
    token,
    user: session.profile.user,
    error: null,
  });

  return {
    authContext,
    session,
  };
}

async function persistOfflineSnapshot(get: () => AppState) {
  const state = get();

  if (!state.user) {
    return;
  }

  try {
    const snapshot = await saveOfflineCache(buildCacheSnapshot(state));
    useAppStore.setState({
      lastCacheAt: snapshot.savedAt,
      lastSyncedAt: snapshot.savedAt,
    });
  } catch (error) {
    logStoreError('offlineCache', error);
  }
}

async function refreshPendingSyncCount(set: StoreSet) {
  const queue = await loadPendingSyncQueue().catch(() => []);
  set({ pendingSyncCount: queue.length });
  return queue;
}

async function registerCurrentPushToken() {
  const get = () => useAppStore.getState();
  const session = captureSessionIdentity(get);
  if (!isSessionIdentityCurrent(get, session)) return;

  try {
    await configureAppNotifications();
    if (!isSessionIdentityCurrent(get, session)) return;
    // Permission controls visible notifications only. FCM token registration
    // must continue even when the user denies the Android 13+ prompt because
    // data delivery is also used by realtime/call infrastructure.
    await requestAppNotificationPermission().catch(() => 'unavailable');
    if (!isSessionIdentityCurrent(get, session)) return;
    const pushToken = await requestNativePushToken();

    if (!pushToken || !isSessionIdentityCurrent(get, session)) {
      return;
    }

    const previousPushToken = await getStoredItem(PUSH_TOKEN_KEY);
    if (!isSessionIdentityCurrent(get, session)) return;

    if (previousPushToken !== pushToken) {
      if (previousPushToken) {
        await unregisterPushSubscriptionRequest(previousPushToken).catch(() => undefined);
        if (!isSessionIdentityCurrent(get, session)) return;
      }

      await setStoredItem(PUSH_TOKEN_KEY, pushToken);
      if (!isSessionIdentityCurrent(get, session)) return;
    }

    await registerPushSubscriptionRequest({
      token: pushToken,
      platform: Platform.OS,
      deviceName: Platform.OS,
    });
  } catch (error) {
    if (isSessionIdentityCurrent(get, session)) {
      logStoreError('pushToken', error);
    }
  }
}

function setNetworkSignal(set: StoreSet, signal: NetworkStatus, snapshot?: MobileNetworkSnapshot | null) {
  set((state) => ({
    ...(signal === 'offline'
      ? applyPresenceToLoadedEntities(state, markAllPresenceUnknown())
      : {}),
    networkStatus: signal === 'online' && state.networkStatus === 'recovering' ? 'online' : signal,
    networkSnapshot: typeof snapshot === 'undefined' ? state.networkSnapshot : snapshot,
  }));
}

function disconnectSocket() {
  if (socketHeartbeatTimer) {
    clearInterval(socketHeartbeatTimer);
    socketHeartbeatTimer = null;
  }

  if (socket) {
    socket.removeAllListeners();
    socket.io.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  socketSessionKey = null;
  missedHeartbeatAcks = 0;
  useAppStore.setState((state) => ({
    ...applyPresenceToLoadedEntities(state, markAllPresenceUnknown()),
    socketStatus: 'disconnected',
    realtimeDiagnostics: {
      ...state.realtimeDiagnostics,
      lastSocketTransitionAt: new Date().toISOString(),
      missedHeartbeatAcks: 0,
      reason: 'socket_disconnected',
    },
  }));
}

function joinCurrentConversationRooms(get: () => AppState) {
  const activeSocket = socket;
  if (!activeSocket?.connected) {
    return;
  }

  get().conversations.forEach((conversation) => activeSocket.emit('conversation:join', conversation.id));
}

function emitCurrentPresence(get: () => AppState) {
  const current = get();
  if (!socket?.connected || !current.user || current.isSigningOut) return;
  socket.emit('presence:join', { packetId: createRealtimePacketId('presence') });
}

function cleanupSessionRuntime() {
  disconnectSocket();

  if (apiHealthcheckTimer) {
    clearInterval(apiHealthcheckTimer);
    apiHealthcheckTimer = null;
  }

  if (networkUnsubscribe) {
    networkUnsubscribe();
    networkUnsubscribe = null;
  }

  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
}

function createRealtimePacketId(scope: string) {
  return `${scope}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function timestampMs(value?: string | null) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function mergeOperationalUnitsByFreshness(
  current: OperationalUnitSnapshot[],
  incoming: OperationalUnitSnapshot[]
) {
  const currentById = new Map(current.map((unit) => [unit.unitId, unit]));
  return incoming.map((unit) => {
    const existing = currentById.get(unit.unitId);
    return existing && timestampMs(existing.lastEventAt) > timestampMs(unit.lastEventAt) ? existing : unit;
  });
}

function setSocketTransition(
  set: StoreSet,
  status: SocketStatus,
  reason: string,
  extra: Partial<RealtimeDiagnostics> = {}
) {
  set((state) => {
    if (state.socketStatus !== status || state.realtimeDiagnostics.reason !== reason) {
      mobileLog('realtime', 'socket transition', {
        from: state.socketStatus,
        reason,
        to: status,
      });
    }

    return {
      socketStatus: status,
      realtimeDiagnostics: {
        ...state.realtimeDiagnostics,
        ...extra,
        lastSocketTransitionAt: new Date().toISOString(),
        reason,
      },
    };
  });
}

function connectSocket(
  set: StoreSet,
  get: () => AppState,
  options: { forceFreshTransport?: boolean; diagTrigger?: string } = {}
) {
  const { token, user, isSigningOut } = get();
  if (!user || isSigningOut) {
    logRealtimeDiag('connectSocket:no_session', {
      trigger: options.diagTrigger || 'unknown',
      isSigningOut,
      hasUser: Boolean(user),
    });
    return disconnectSocket();
  }
  const nextSessionKey = `${SOCKET_URL}:${user.id}:${token || 'anonymous'}`;

  logRealtimeDiag('connectSocket', {
    trigger: options.diagTrigger || 'unknown',
    userId: user.id,
    sessionEpoch: getSessionEpoch(),
    socketSessionKeyChanged: socketSessionKey !== nextSessionKey,
    socketExists: Boolean(socket),
    socketConnected: Boolean(socket?.connected),
    socketActive: Boolean(socket?.active),
    socketId: socket?.id || null,
    socketStatus: get().socketStatus,
    networkStatus: get().networkStatus,
    lastPongAt: get().realtimeDiagnostics.lastPongAt,
    missedHeartbeatAcks: get().realtimeDiagnostics.missedHeartbeatAcks,
    forceFreshTransport: Boolean(options.forceFreshTransport),
  });

  if (socket && socketSessionKey === nextSessionKey) {
    if (options.forceFreshTransport) {
      socket.disconnect();
      setSocketTransition(set, 'connecting', 'socket_foreground_recovery_requested');
      socket.connect();
    } else if (!socket.connected) {
      socket.connect();
      setSocketTransition(set, 'connecting', 'socket_reconnect_requested');
    } else {
      joinCurrentConversationRooms(get);
      emitCurrentPresence(get);
    }
    return;
  }

  disconnectSocket();
  socketSessionKey = nextSessionKey;
  missedHeartbeatAcks = 0;
  setSocketTransition(set, 'connecting', 'socket_connect_requested', {
    missedHeartbeatAcks: 0,
  });

  socket = io(SOCKET_URL, {
    auth: token ? { token } : undefined,
    transports: ['websocket', 'polling'],
    timeout: 15000,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.45,
    autoConnect: false,
  });

  const sessionSocket = socket;
  const socketEpoch = getSessionEpoch();
  const socketUserId = user.id;
  const isSocketSessionCurrent = () => Boolean(
    socket === sessionSocket &&
    socketSessionKey === nextSessionKey &&
    !isSessionEpochStale(socketEpoch) &&
    !get().isSigningOut &&
    get().user?.id === socketUserId
  );

  const emitHeartbeat = () => {
    const current = get();
    if (!isSocketSessionCurrent() || !sessionSocket.connected || !current.user) {
      return;
    }

    const packetId = createRealtimePacketId('heartbeat');
    const sentAt = Date.now();

    sessionSocket.timeout(SOCKET_ACK_TIMEOUT_MS).emit(
      'client:heartbeat',
      {
        accountType: current.user.accountType,
        organizationId: current.user.organizationId,
        packetId,
        role: current.user.role,
        sentAt: new Date(sentAt).toISOString(),
        userId: current.user.id,
      },
      (error: unknown, ack?: SocketHeartbeatAck) => {
        if (!isSocketSessionCurrent()) return;

        if (error || ack?.ok === false) {
          missedHeartbeatAcks += 1;
          const reason =
            error instanceof Error
              ? error.message
              : ack?.error || 'heartbeat_ack_timeout';
          mobileLog('socket', 'heartbeat ack failed', {
            ms: Date.now() - sentAt,
            missedHeartbeatAcks,
            packetId,
            reason,
          });

          set((state) => ({
            networkStatus: sessionSocket.connected ? 'online' : 'recovering',
            socketStatus:
              sessionSocket.connected && missedHeartbeatAcks < SOCKET_MISSED_HEARTBEAT_LIMIT
                ? 'connected'
                : 'reconnecting',
            realtimeDiagnostics: {
              ...state.realtimeDiagnostics,
              heartbeatLatencyMs: null,
              lastPingAt: new Date(sentAt).toISOString(),
              missedHeartbeatAcks,
              reason:
                missedHeartbeatAcks < SOCKET_MISSED_HEARTBEAT_LIMIT
                  ? 'heartbeat_ack_missed_socket_alive'
                  : 'heartbeat_ack_limit_reached',
            },
          }));

          if (missedHeartbeatAcks >= SOCKET_MISSED_HEARTBEAT_LIMIT) {
            socketReconnectAttempts += 1;
            setSocketTransition(set, 'reconnecting', 'heartbeat_ack_limit_reached', {
              reconnectAttempts: socketReconnectAttempts,
            });
            sessionSocket.disconnect();
            sessionSocket.connect();
          }
          return;
        }

        missedHeartbeatAcks = 0;
        set((state) => ({
          socketStatus: 'connected',
          networkStatus: 'online',
          realtimeDiagnostics: {
            ...state.realtimeDiagnostics,
            heartbeatLatencyMs: Date.now() - sentAt,
            lastPingAt: new Date(sentAt).toISOString(),
            lastPongAt: new Date().toISOString(),
            missedHeartbeatAcks: 0,
            reason: 'heartbeat_ack_ok',
          },
        }));
      }
    );
  };

  sessionSocket.on('connect', () => {
    if (!isSocketSessionCurrent()) return;
    missedHeartbeatAcks = 0;
    socketAuthRetries = 0;
    setSocketTransition(set, 'connected', 'socket_connected', {
      missedHeartbeatAcks: 0,
    });
    set({ networkStatus: 'online' });
    mobileLog('socket', `connected ${sessionSocket.id || ''}`);
    emitCurrentPresence(get);
    emitHeartbeat();
    joinCurrentConversationRooms(get);
  });

  sessionSocket.io.on('reconnect_attempt', () => {
    if (!isSocketSessionCurrent()) return;
    socketReconnectAttempts += 1;
    setSocketTransition(set, 'reconnecting', 'socket_reconnect_attempt', {
      reconnectAttempts: socketReconnectAttempts,
    });
  });

  sessionSocket.io.on('reconnect', () => {
    if (!isSocketSessionCurrent()) return;
    missedHeartbeatAcks = 0;
    setSocketTransition(set, 'connected', 'socket_reconnected', {
      missedHeartbeatAcks: 0,
      reconnectAttempts: socketReconnectAttempts,
    });
    joinCurrentConversationRooms(get);
    // El transporte ya esta conectado. La reconciliacion de datos corre en segundo
    // plano y no vuelve a degradar socket/network ni sostiene chrome de reconexion.
    void Promise.allSettled([
      get().refreshAll(),
      get().flushPendingSync(),
    ]);
  });

  sessionSocket.on('disconnect', (reason) => {
    if (!isSocketSessionCurrent()) return;
    set((state) => applyPresenceToLoadedEntities(state, markAllPresenceUnknown()));
    setSocketTransition(set, reason === 'io client disconnect' ? 'disconnected' : 'reconnecting',
      `socket_disconnect:${reason}`);
    mobileLog('socket', `disconnected: ${reason}`);
  });

  sessionSocket.on('connect_error', (error) => {
    if (!isSocketSessionCurrent()) return;
    logRealtimeDiag('connect_error', {
      reason: error.message,
      isRealtimeAuthError: isRealtimeAuthError(error.message),
      socketAuthRetries,
      socketStatus: get().socketStatus,
      socketConnected: sessionSocket.connected,
      socketActive: sessionSocket.active,
      socketId: sessionSocket.id || null,
      sessionEpoch: getSessionEpoch(),
    });

    if (isRealtimeAuthError(error.message)) {
      if (socketAuthRetries >= 1) {
        setSocketTransition(set, 'unauthorized', 'socket_auth_retry_exhausted');
        mobileLog('socket', 'connect_error after refreshed token', error.message);
        return;
      }

      setSocketTransition(set, 'reconnecting', 'socket_auth_refresh_requested');
      mobileLog('socket', 'connect_error requires token refresh', error.message);
      void refreshRealtimeAuth(set, get).catch((refreshError) => {
        if (!isSocketSessionCurrent()) return;
        mobileLog('socket', 'unexpected realtime auth refresh failure', refreshError);
        if (get().user) {
          setSocketTransition(set, 'reconnecting', 'socket_auth_refresh_unexpected_failure');
        }
      });
      return;
    }

    // `socket.active` is true while the manager will keep retrying (e.g. the
    // server is asleep during a Render cold start). In that case the banner must
    // read "Reconectando", not the terminal "Servidor no disponible" — the
    // latter is reserved for fatal failures where reconnection has stopped.
    setSocketTransition(
      set,
      sessionSocket.active ? 'reconnecting' : 'error',
      `socket_connect_error:${error.message}`
    );
    mobileLog('socket', 'connect_error', error.message);
  });

  const handleIncomingConversationMessage = async (
    payload: ChatMessage | { message?: ChatMessage; conversationId?: string }
  ) => {
    if (!isSocketSessionCurrent()) return;
    const m = 'message' in payload && payload.message ? payload.message : payload as ChatMessage;

    if (!m.conversationId) {
      return;
    }

    const sessionUser = get().user;
    if (!sessionUser || sessionUser.id !== socketUserId) return;
    const hydrated = await hydrateConversationMessage(
      m,
      get().conversations.find(c => c.id === m.conversationId) || null,
      sessionUser
    );
    if (!isSocketSessionCurrent()) return;

    const conversationId = hydrated.conversationId!;
    const isOwnMessageBefore = hydrated.senderId === socketUserId;
    let insertedMessage = false;
    set(s => {
      const alreadyExists = (s.messagesByConversation[conversationId] || []).some(
        (message) => message.id === hydrated.id
      );
      const isOwnMessage = hydrated.senderId === s.user?.id;
      insertedMessage = !alreadyExists;

      return {
        messagesByConversation: upsertConversationMessage(
          s.messagesByConversation,
          conversationId,
          hydrated
        ),
        conversations: sortConversations(s.conversations.map(c => c.id === conversationId ? {
          ...c,
          lastMessage: hydrated,
          unreadCount: !alreadyExists && !isOwnMessage ? c.unreadCount + 1 : c.unreadCount
        } : c))
      };
    });

    const isRadioConversation =
      get().conversations.find((conversation) => conversation.id === conversationId)
        ?.channelMode === 'radio';
    const isRadio = hydrated.kind === 'audio' || isRadioConversation;

    if (!isOwnMessageBefore && !isRadioConversation) {
      sessionSocket.emit('chat:delivered', {
        conversationId,
        messageId: hydrated.id,
      });
    }

    if (insertedMessage && !isOwnMessageBefore && !isRadio) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }

    if (insertedMessage && !isOwnMessageBefore && NativeAppState.currentState !== 'active') {
      // Un hilo cifrado no puede ofrecer respuesta rapida: el headless task no tiene
      // las llaves y responder desde ahi degradaria el mensaje a texto plano.
      const isEncryptedThread =
        Boolean(hydrated.encrypted) ||
        isDirectChatEncryptionActive({
          currentUserId: socketUserId,
          conversation: get().conversations.find((c) => c.id === conversationId) || null,
        });

      showInAppNotification({
        title: isRadio ? 'Audio de radio recibido' : 'Mensaje nuevo',
        body: hydrated.sender?.name || 'ManeComb operativo',
        category: isRadio ? 'radio' : 'chat',
        deepLink: isRadio
          ? 'manecomb://radio'
          : `manecomb://chat?conversationId=${encodeURIComponent(conversationId)}&channelMode=chat`,
        encrypted: isEncryptedThread,
        data: {
          category: isRadio ? 'radio' : 'chat',
          conversationId,
          encrypted: isEncryptedThread,
        },
      }).catch(() => undefined);
    }
  };

  sessionSocket.on('chat:message', (payload) => {
    handleIncomingConversationMessage(payload).catch(() => undefined);
  });
  sessionSocket.on('radio:message:new', (payload) => {
    handleIncomingConversationMessage(payload).catch(() => undefined);
  });

  sessionSocket.on('chat:typing', ({ conversationId, userId, userName }: { conversationId: string; userId: string; userName: string }) => {
    if (!isSocketSessionCurrent()) return;
    set(s => {
      const existing = s.typingByConversation[conversationId] || [];
      if (existing.some(t => t.userId === userId)) return s;
      return {
        ...s,
        typingByConversation: {
          ...s.typingByConversation,
          [conversationId]: [...existing, { userId, userName, startedAt: Date.now() }],
        },
      };
    });
  });

  sessionSocket.on('chat:typing:stop', ({ conversationId, userId }: { conversationId: string; userId: string }) => {
    if (!isSocketSessionCurrent()) return;
    set(s => {
      const existing = s.typingByConversation[conversationId] || [];
      const filtered = existing.filter(t => t.userId !== userId);
      if (filtered.length === existing.length) return s;
      return {
        ...s,
        typingByConversation: {
          ...s.typingByConversation,
          [conversationId]: filtered,
        },
      };
    });
  });

  sessionSocket.on('chat:delivered', ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
    if (!isSocketSessionCurrent()) return;
    let messageFound = false;
    set(s => {
      const messages = s.messagesByConversation[conversationId];
      if (!messages) return s;
      messageFound = messages.some(message => message.id === messageId);
      return {
        ...s,
        messagesByConversation: {
          ...s.messagesByConversation,
          [conversationId]: messages.map(m =>
            m.id === messageId && m.status === 'sent' ? { ...m, status: 'delivered' } : m
          ),
        },
      };
    });
    if (!messageFound) get().loadConversation(conversationId).catch(() => undefined);
  });

  sessionSocket.on('chat:read', ({ conversationId, messageId, userId: _userId }: { conversationId: string; messageId: string; userId: string }) => {
    if (!isSocketSessionCurrent()) return;
    let messageFound = false;
    set(s => {
      const messages = s.messagesByConversation[conversationId];
      if (!messages) return s;
      messageFound = messages.some(message => message.id === messageId);
      const existing = s.readByConversation[conversationId] || new Set();
      const next = new Set(existing);
      next.add(messageId);
      return {
        ...s,
        messagesByConversation: {
          ...s.messagesByConversation,
          [conversationId]: messages.map(m => m.id === messageId && m.status !== 'read' ? { ...m, status: 'read' } : m),
        },
        readByConversation: {
          ...s.readByConversation,
          [conversationId]: next,
        },
      };
    });
    if (!messageFound) get().loadConversation(conversationId).catch(() => undefined);
  });

  sessionSocket.on('presence:snapshot', ({ userIds }: { userIds: string[] }) => {
    if (!isSocketSessionCurrent()) return;
    set(state => applyPresenceToLoadedEntities(
      state,
      buildPresenceSnapshot(getKnownPresenceUserIds(state), userIds || [])
    ));
  });

  sessionSocket.on('presence:updated', ({ userId, status }: { userId: string; status: 'online' | 'offline' }) => {
    if (!isSocketSessionCurrent()) return;
    set(state => applyPresenceToLoadedEntities(state, {
      ...state.presenceByUser,
      [userId]: status,
    }));
  });

  sessionSocket.on('location:updated', (v: Vehicle) => {
    if (!isSocketSessionCurrent()) return;
    const nextVehicle = normalizeVehicle(v);
    set(s => ({
      mapData: s.mapData
        ? {
            ...s.mapData,
            vehicles: s.mapData.vehicles.some(ev => ev.id === nextVehicle.id)
              ? s.mapData.vehicles.map(ev => ev.id === nextVehicle.id
                  ? timestampMs(ev.locationTimestamp) > timestampMs(nextVehicle.locationTimestamp)
                    ? ev
                    : normalizeVehicle({ ...ev, ...nextVehicle })
                  : ev)
              : [...s.mapData.vehicles, nextVehicle],
            updatedAt: new Date().toISOString(),
          }
        : s.mapData,
    }));
  });

  // Snapshot canonico completo. Se reemplaza la unidad entera: nunca se hace
  // merge parcial, porque un merge reintroduce campos de origen distinto.
  sessionSocket.on('operational-unit:updated', (payload: unknown) => {
    if (!isSocketSessionCurrent()) return;
    const socketReceivedAtMs = Date.now();
    const unit =
      payload && typeof payload === 'object' && 'unit' in (payload as Record<string, unknown>)
        ? ((payload as { unit: OperationalUnitSnapshot }).unit)
        : null;
    if (!unit || typeof unit !== 'object' || !unit.unitId) return;

    set(s => {
      const existing = s.operationalUnits.find(entry => entry.unitId === unit.unitId);
      if (existing && timestampMs(existing.lastEventAt) > timestampMs(unit.lastEventAt)) return s;
      const appliedAtMs = Date.now();
      return {
        operationalUnits: existing
          ? s.operationalUnits.map(entry => (entry.unitId === unit.unitId ? unit : entry))
          : [...s.operationalUnits, unit],
        resources: {
          ...s.resources,
          operationalUnits: applyIncrementalResourceEvent(s.resources.operationalUnits, { hasDataAfterMutation: true }),
        },
        realtimeDiagnostics: {
          ...s.realtimeDiagnostics,
          operationalSocketReceivedAt: new Date(socketReceivedAtMs).toISOString(),
          operationalAppliedAt: new Date(appliedAtMs).toISOString(),
          operationalReceiveToApplyMs: Math.max(0, appliedAtMs - socketReceivedAtMs),
          operationalUnitId: unit.unitId,
        },
      };
    });
  });

  sessionSocket.on('vehicle:created', (payload: unknown) => {
    if (!isSocketSessionCurrent()) return;
    const raw = payload && typeof payload === 'object' && 'vehicle' in (payload as Record<string, unknown>)
      ? (payload as { vehicle: Vehicle }).vehicle
      : (payload as Vehicle);
    if (!raw || typeof raw !== 'object' || !('id' in raw)) return;
    const normalized = normalizeVehicle(raw as Vehicle);
    set(s => ({
      mapData: s.mapData
        ? {
            ...s.mapData,
            vehicles: s.mapData.vehicles.some(ev => ev.id === normalized.id)
              ? s.mapData.vehicles.map(ev =>
                  ev.id === normalized.id ? { ...ev, ...normalized } : ev
                )
              : [...s.mapData.vehicles, normalized],
            updatedAt: new Date().toISOString(),
          }
        : s.mapData,
    }));
  });

  sessionSocket.on('vehicle:updated', (payload: unknown) => {
    if (!isSocketSessionCurrent()) return;
    const raw = payload && typeof payload === 'object' && 'vehicle' in (payload as Record<string, unknown>)
      ? (payload as { vehicle: Vehicle }).vehicle
      : (payload as Vehicle);
    if (!raw || typeof raw !== 'object' || !('id' in raw)) return;
    const normalized = normalizeVehicle(raw as Vehicle);
    set(s => ({
      mapData: s.mapData
        ? {
            ...s.mapData,
            vehicles: s.mapData.vehicles.some(ev => ev.id === normalized.id)
              ? s.mapData.vehicles.map(ev =>
                  ev.id === normalized.id ? { ...ev, ...normalized } : ev
                )
              : [...s.mapData.vehicles, normalized],
            updatedAt: new Date().toISOString(),
          }
        : s.mapData,
    }));
  });

  sessionSocket.on('user:deleted', (payload: unknown) => {
    if (!isSocketSessionCurrent()) return;
    const rawPayload = payload as Record<string, unknown>;
    const userId = typeof rawPayload?.userId === 'string'
      ? rawPayload.userId
      : typeof rawPayload?.user === 'object' && rawPayload.user !== null
        ? (rawPayload.user as Record<string, unknown>)?.id as string | undefined
        : undefined;
    if (!userId) return;
    set(s => ({
      users: s.users.filter((u) => u.id !== userId),
    }));
    get().refreshAll().catch(() => undefined);
  });

  sessionSocket.on('route-session:updated', (session: RouteSession) => {
    if (!isSocketSessionCurrent()) return;
    if (
      !shouldAdoptRouteSessionUpdate({
        sessionVehicleId: session?.vehicleId,
        userVehicleId: get().user?.vehicleId,
      })
    ) {
      return;
    }

    set({ activeRouteSession: ['RUNNING', 'PAUSED'].includes(session.status) ? session : null });
    persistOfflineSnapshot(get);
  });

  sessionSocket.on('user:updated', (payload: { user?: User }) => {
    if (!isSocketSessionCurrent()) return;
    if (payload.user?.id === get().user?.id) set({ user: payload.user });
    get().refreshAll().catch(() => undefined);
  });

  // Alertas operativas con la app abierta. Antes no existia ningun consumidor de
  // `notification:created` ni de `incident:sos`, asi que un SOS no producia
  // ninguna senal audible ni haptica mientras el supervisor usaba ManeComb.
  //
  // Se reutiliza el socket que ya existe: sin bus nuevo. El dedup vive en la
  // politica nativa y es el mismo que consulta el push, para que socket y FCM no
  // suenen los dos por el mismo incidentId durante una transicion
  // foreground/background.
  sessionSocket.on('notification:created', (payload: unknown) => {
    if (!isSocketSessionCurrent()) return;
    const alert = toOperationalAlertFromNotification(payload);
    if (!alert) return;
    void playOperationalAlertFeedback(alert);
  });

  sessionSocket.on('incident:sos', (payload: unknown) => {
    if (!isSocketSessionCurrent()) return;
    const alert = toOperationalAlertFromSos(payload);
    if (!alert) return;
    void playOperationalAlertFeedback(alert);
  });

  // `incident:updated` sigue sin producir sonido: un cambio de estado no es una
  // alerta nueva, y backend tampoco emite notificacion al pasar a in_progress o
  // resolved.
  sessionSocket.on('incident:created', (i: Incident) => {
    if (!isSocketSessionCurrent()) return;
    set(s => {
      const incident = enrichIncidentFromState(s, i);
      return {
        incidents: upsertIncident(s.incidents, incident),
        mapData: applyIncidentToMapData(s.mapData, incident),
        resources: { ...s.resources, incidents: applyIncrementalResourceEvent(s.resources.incidents, { hasDataAfterMutation: true }) },
      };
    });
  });
  sessionSocket.on('incident:updated', (i: Incident) => {
    if (!isSocketSessionCurrent()) return;
    set(s => {
      const incident = enrichIncidentFromState(s, i);
      return {
        incidents: upsertIncident(s.incidents, incident),
        mapData: applyIncidentToMapData(s.mapData, incident),
        resources: { ...s.resources, incidents: applyIncrementalResourceEvent(s.resources.incidents, { hasDataAfterMutation: true }) },
      };
    });
  });

  [
    'account:created',
    'payment:confirmed',
    'plan:active',
    'users:invited',
    'user:first-login',
    'subscription:updated',
    'onboarding:updated',
    'activation-keys:updated',
  ].forEach((eventName) => {
    sessionSocket.on(eventName, (_payload) => {
      if (!isSocketSessionCurrent()) return;
      if (eventName === 'users:invited' || eventName === 'user:first-login') {
        get().loadUsers();
      }
      if (eventName === 'payment:confirmed' || eventName === 'plan:active' || eventName === 'subscription:updated') {
        get().refreshAll()
          .catch((error) => logStoreError(`socket:${eventName}:session`, error));
      }
    });
  });

  socketHeartbeatTimer = setInterval(() => {
    emitHeartbeat();
  }, SOCKET_HEARTBEAT_MS);

  sessionSocket.connect();
}

async function hydrateConversationMessage(m: ChatMessage, c: ConversationSummary | null, u: User | null) {
  if (!m.e2eeEnvelope || !c || !u || c.kind !== 'direct') return m;
  try {
    const keys = await getStoredChatKeyPair(u.id);
    if (!keys?.secretKey) return { ...m, text: '', textPreview: 'Cifrado (Sincroniza este dispositivo)' };
    const peerKey = m.senderId === u.id ? c.participants.find(p => p.id === m.e2eeEnvelope?.recipientId)?.e2eePublicKey : (m.sender?.e2eePublicKey || m.e2eeEnvelope.senderPublicKey);
    if (!isE2eeCapablePublicKey(peerKey)) return { ...m, text: '', textPreview: 'Cifrado E2EE' };
    const text = decryptDirectChatText({ envelope: m.e2eeEnvelope as DirectMessageEnvelope, peerPublicKey: peerKey!, currentUserSecretKey: keys.secretKey });
    return { ...m, text, textPreview: text, encrypted: true };
  } catch { return { ...m, text: '', textPreview: 'Error al descifrar', encrypted: true }; }
}

async function hydrateMessages(ms: ChatMessage[], cs: ConversationSummary[], u: User | null, cid?: string) {
  const c = cs.find(e => e.id === cid) || cs.find(e => ms.some(m => m.conversationId === e.id)) || null;
  return await Promise.all(ms.map(m => hydrateConversationMessage(m, c, u)));
}

async function applyRefreshedSession(
  set: StoreSet,
  get: () => AppState,
  result: LoginResult
) {
  const refreshSession = captureSessionIdentity(get);
  if (!isSessionIdentityCurrent(get, refreshSession)) return;

  const nextRefreshToken = result.refreshToken || get().refreshToken;
  const authContext = getAuthContextFromPayload(result);
  setAuthToken(result.token);
  if (get().sessionPersistence === 'persistent') {
    await persistSession(result.token, get().connectionMode, nextRefreshToken);
  } else {
    await persistSession(null, null);
  }

  if (!isSessionIdentityCurrent(get, refreshSession)) return;
  set({
    authContext,
    token: result.token,
    refreshToken: nextRefreshToken || null,
    user: result.user || get().user,
  });
  connectSocket(set, get, { diagTrigger: 'applyRefreshedSession' });
}

function refreshRealtimeAuth(set: StoreSet, get: () => AppState): Promise<string | null> {
  if (realtimeAuthRefreshInFlight) {
    return realtimeAuthRefreshInFlight;
  }

  const epoch = getSessionEpoch();
  realtimeAuthRefreshInFlight = (async () => {
    const refreshToken = get().refreshToken || await getStoredItem(REFRESH_TOKEN_KEY);
    const tokenBefore = get().token;
    const userIdBefore = get().user?.id || null;

    logRealtimeDiag('refreshRealtimeAuth:start', {
      sessionEpoch: epoch,
      hasRefreshToken: Boolean(refreshToken),
      userId: userIdBefore,
      socketStatus: get().socketStatus,
      socketAuthRetries,
    });

    if (!refreshToken) {
      logRealtimeDiag('refreshRealtimeAuth:end', {
        outcome: 'failure',
        code: 'refresh_token_missing',
        sessionEpochBefore: epoch,
        sessionEpochAfter: getSessionEpoch(),
      });
      setSocketTransition(set, 'unauthorized', 'socket_auth_refresh_token_missing');
      return null;
    }

    try {
      const result = await refreshSessionRequest(refreshToken, APP_VERSION);
      if (isSessionEpochStale(epoch) || !get().user || get().isSigningOut) {
        logRealtimeDiag('refreshRealtimeAuth:end', {
          outcome: 'discarded',
          code: 'session_epoch_stale',
          sessionEpochBefore: epoch,
          sessionEpochAfter: getSessionEpoch(),
        });
        return null;
      }

      // One successful refresh is allowed per authentication-failure cycle. A
      // second rejection of the refreshed token is terminal until re-login.
      socketAuthRetries += 1;
      await applyRefreshedSession(set, get, result);

      // El valor del token nunca se registra: solo si cambio, que es lo que
      // decide si connectSocket vera una sessionKey distinta.
      logRealtimeDiag('refreshRealtimeAuth:end', {
        outcome: 'success',
        accessTokenChanged: get().token !== tokenBefore,
        sessionEpochBefore: epoch,
        sessionEpochAfter: getSessionEpoch(),
        userIdBefore,
        userIdAfter: get().user?.id || null,
        socketAuthRetries,
        socketStatus: get().socketStatus,
      });
      return result.token;
    } catch (error) {
      if (isSessionEpochStale(epoch) || !get().user || get().isSigningOut) {
        logRealtimeDiag('refreshRealtimeAuth:end', {
          outcome: 'discarded',
          code: 'session_epoch_stale_after_error',
          sessionEpochBefore: epoch,
          sessionEpochAfter: getSessionEpoch(),
        });
        return null;
      }

      const status = isAxiosError(error) ? error.response?.status : null;
      const transientFailure =
        isProbablyNetworkError(error) ||
        status === 429 ||
        (typeof status === 'number' && status >= 500);

      logRealtimeDiag('refreshRealtimeAuth:end', {
        outcome: 'failure',
        httpStatus: status,
        code: transientFailure ? 'transient' : 'rejected',
        nextSocketStatus: transientFailure ? 'reconnecting' : 'unauthorized',
        sessionEpochBefore: epoch,
        sessionEpochAfter: getSessionEpoch(),
        socketAuthRetries,
      });

      setSocketTransition(
        set,
        transientFailure ? 'reconnecting' : 'unauthorized',
        transientFailure
          ? 'socket_auth_refresh_temporarily_unavailable'
          : 'socket_auth_refresh_rejected'
      );
      return null;
    } finally {
      realtimeAuthRefreshInFlight = null;
    }
  })();

  return realtimeAuthRefreshInFlight;
}

function recoverMobileRuntimeAfterForeground(set: StoreSet, get: () => AppState) {
  if (foregroundRecoveryInFlight) {
    return foregroundRecoveryInFlight;
  }

  const epoch = getSessionEpoch();
  logRealtimeDiag('foregroundRecovery:start', {
    appState: NativeAppState.currentState,
    sessionEpoch: epoch,
    socketStatus: get().socketStatus,
    socketConnected: Boolean(socket?.connected),
    lastPongAt: get().realtimeDiagnostics.lastPongAt,
    missedHeartbeatAcks: get().realtimeDiagnostics.missedHeartbeatAcks,
  });
  const recovery = (async () => {
    const snapshot = await refreshMobileNetworkSnapshot()
      .catch(() => get().networkSnapshot);

    if (
      isSessionEpochStale(epoch) ||
      !get().user ||
      get().isSigningOut ||
      NativeAppState.currentState !== 'active'
    ) {
      return;
    }

    setNetworkSignal(set, getForegroundNetworkSignal(snapshot), snapshot);

    if (!hasPhysicalNetworkLink(snapshot)) {
      return;
    }

    const current = get();
    const forceFreshTransport = shouldRestartRealtimeAfterForeground({
      lastPongAt: current.realtimeDiagnostics.lastPongAt,
      missedHeartbeatAcks: current.realtimeDiagnostics.missedHeartbeatAcks,
      socketConnected: Boolean(socket?.connected),
      socketStatus: current.socketStatus,
    });

    logRealtimeDiag('foregroundRecovery:decision', {
      appState: NativeAppState.currentState,
      socketStatus: current.socketStatus,
      socketConnected: Boolean(socket?.connected),
      lastPongAt: current.realtimeDiagnostics.lastPongAt,
      missedHeartbeatAcks: current.realtimeDiagnostics.missedHeartbeatAcks,
      forceFreshTransport,
    });

    connectSocket(set, get, { diagTrigger: 'foregroundRecovery', forceFreshTransport });

    try {
      await healthRequest();
    } catch (error) {
      if (
        isSessionEpochStale(epoch) ||
        !get().user ||
        get().isSigningOut ||
        NativeAppState.currentState !== 'active'
      ) {
        return;
      }

      if (socket?.connected) {
        setNetworkSignal(set, 'online', snapshot);
      } else if (isProbablyNetworkError(error)) {
        setNetworkSignal(set, 'offline', snapshot);
      }
      return;
    }

    if (
      isSessionEpochStale(epoch) ||
      !get().user ||
      get().isSigningOut ||
      NativeAppState.currentState !== 'active'
    ) {
      return;
    }

    setNetworkSignal(set, 'online', snapshot);
    const afterProbe = get();
    if (shouldRestartRealtimeAfterForeground({
      lastPongAt: afterProbe.realtimeDiagnostics.lastPongAt,
      missedHeartbeatAcks: afterProbe.realtimeDiagnostics.missedHeartbeatAcks,
      socketConnected: Boolean(socket?.connected),
      socketStatus: afterProbe.socketStatus,
    })) {
      // Si el intento iniciado arriba sigue activo, `connect()` es idempotente y
      // no cancela su handshake. Solo se fuerza un transporte nuevo cuando el
      // socket afirma estar conectado pero el heartbeat demuestra que quedo viejo.
      connectSocket(set, get, { forceFreshTransport: Boolean(socket?.connected), diagTrigger: 'networkRecovery' });
    }

    await Promise.allSettled([
      get().flushPendingSync(),
      get().refreshAll(),
    ]);
  })();

  foregroundRecoveryInFlight = recovery;
  void recovery.finally(() => {
    logRealtimeDiag('foregroundRecovery:end', {
      appState: NativeAppState.currentState,
      sessionEpoch: getSessionEpoch(),
      socketStatus: get().socketStatus,
      socketConnected: Boolean(socket?.connected),
      socketId: socket?.id || null,
      lastPongAt: get().realtimeDiagnostics.lastPongAt,
      missedHeartbeatAcks: get().realtimeDiagnostics.missedHeartbeatAcks,
    });
    if (foregroundRecoveryInFlight === recovery) {
      foregroundRecoveryInFlight = null;
    }
  });

  return recovery;
}

function configureMobileRuntime(set: StoreSet, get: () => AppState) {
  if (!recoveryConfigured) {
    configureApiSessionRecovery({
      getRefreshToken: async () => get().refreshToken || getStoredItem(REFRESH_TOKEN_KEY),
      onTokenRefresh: async (result) => {
        await applyRefreshedSession(set, get, result);
      },
      onSessionExpired: async () => {
        await clearSessionState(set, 'Sesion expirada. Inicia sesion nuevamente.');
      },
      onAccountSuspended: async () => {
        await clearSessionState(set);
        set({ accountSuspended: true });
      },
      onNetworkSignal: (signal) => {
        if (!get().isSigningOut) setNetworkSignal(set, signal);
      },
    });
    recoveryConfigured = true;
  }

  if (!networkUnsubscribe) {
    networkUnsubscribe = subscribeMobileNetwork((snapshot) => {
      const reachable = isNetworkReachable(snapshot);
      if (!get().isSigningOut) {
        setNetworkSignal(set, reachable ? 'online' : 'offline', snapshot);
      }

      if (reachable && get().user && !get().isSigningOut) {
        connectSocket(set, get, { diagTrigger: 'netinfoReachable' });
        get().flushPendingSync();
      }
    });
  }

  if (!appStateSubscription) {
    appStateSubscription = NativeAppState.addEventListener('change', (state) => {
      if (state === 'active' && get().user && !get().isSigningOut) {
        set((current) => applyPresenceToLoadedEntities(current, markAllPresenceUnknown()));
        void recoverMobileRuntimeAfterForeground(set, get);
      } else if (state !== 'active' && !get().isSigningOut) {
        set((current) => applyPresenceToLoadedEntities(current, markAllPresenceUnknown()));
      }
    });
  }

  if (!apiHealthcheckTimer) {
    apiHealthcheckTimer = setInterval(() => {
      // Deliberately NOT gated on `networkStatus === 'offline'`: that is the
      // very state this probe exists to escape. Any REST failure latches
      // `offline` (see processPendingSyncQueue), and if the poller skipped that
      // state the banner stayed pinned until the app was killed and reopened.
      // Gate only on the device-level radio being unreachable, where an HTTP
      // probe cannot succeed anyway.
      if (!get().user || get().isSigningOut || !hasPhysicalNetworkLink(get().networkSnapshot)) {
        return;
      }

      healthRequest()
        .then(() => {
          if (!get().user || get().isSigningOut) return;
          const wasOffline = get().networkStatus === 'offline';
          set({ networkStatus: 'online' });
          // The backend is awake again. Anything parked by a failed upload
          // (e.g. a voice note queued when the cold start timed out) must be
          // drained here: the socket may already be connected, in which case no
          // `reconnect` event will fire to trigger the flush.
          if (wasOffline) {
            get().flushPendingSync();
          }
          // The health check proves the backend is awake again (e.g. after a
          // cold start). If the realtime socket is not connected, deterministically
          // revive it here so the connection banner clears without restarting the
          // app. connectSocket is idempotent when the session key is unchanged.
          const current = get();
          if (!current.user || current.isSigningOut) {
            return;
          }
          if (!socket?.connected) {
            connectSocket(set, get, { diagTrigger: 'healthcheckSocketDown' });
          } else {
            // Socket reports connected but the app-level status may still be
            // reconnecting/error because the one-shot heartbeat on connect
            // timed out (e.g. backend was still initialising after a cold
            // start). Force a clean reconnect to trigger a fresh heartbeat
            // and clear the banner.
            const needHeartbeat = !current.realtimeDiagnostics.lastPongAt ||
              current.realtimeDiagnostics.missedHeartbeatAcks > 0 ||
              current.socketStatus !== 'connected';
            if (needHeartbeat) {
              connectSocket(set, get, { forceFreshTransport: true, diagTrigger: 'healthcheckStaleHeartbeat' });
            }
          }
        })
        .catch((error) => {
          if (!get().isSigningOut && isProbablyNetworkError(error) && !socket?.connected) {
            setNetworkSignal(set, 'offline');
          }
        });
    }, API_HEALTHCHECK_MS);
  }
}

async function processPendingSyncQueue(set: StoreSet, get: () => AppState) {
  if (pendingSyncInFlight || !get().token || !get().user || get().isSigningOut || get().networkStatus === 'offline') {
    return;
  }

  const replaySession = captureSessionIdentity(get);
  if (!isSessionIdentityCurrent(get, replaySession)) return;
  pendingSyncInFlight = true;

  try {
    const queue = await refreshPendingSyncCount(set);
    if (!isSessionIdentityCurrent(get, replaySession)) return;

    if (!queue.length) {
      return;
    }

    for (const operation of queue) {
      if (!isSessionIdentityCurrent(get, replaySession)) return;

      try {
        if (operation.type === 'control:sessionStart') {
          const session = await startRouteSessionRequest(
            operation.payload.vehicleId,
            operation.payload.startedAt || operation.createdAt,
          );
          if (!isSessionIdentityCurrent(get, replaySession)) return;
          set({ activeRouteSession: session });
        } else if (operation.type === 'control:sessionStatus') {
          let sessionId = operation.payload.sessionId;
          if (!sessionId) {
            const activeSession = await getActiveRouteSessionRequest(operation.payload.vehicleId);
            if (!isSessionIdentityCurrent(get, replaySession)) return;
            sessionId = activeSession?.id;
          }
          if (!sessionId) throw new Error('No existe una jornada activa para sincronizar');
          const session = await updateRouteSessionStatusRequest(
            sessionId,
            operation.payload.vehicleId,
            operation.payload.status
          );
          if (!isSessionIdentityCurrent(get, replaySession)) return;
          set({ activeRouteSession: ['RUNNING', 'PAUSED'].includes(session.status) ? session : null });
        } else if (operation.type === 'incident:create') {
          await createIncidentRequest(operation.payload);
        } else if (operation.type === 'incident:updateStatus') {
          await updateIncidentStatusRequest(
            operation.payload.incidentId,
            operation.payload.status
          );
        } else if (operation.type === 'chat:sendMessage') {
          const state = get();
          if (!state.user || state.user.id !== replaySession.userId) {
            return;
          }
          const durableClientMessageId =
            normalizeClientMessageId(operation.payload.clientMessageId) || operation.id;
          const messagePayload = await buildTextMessagePayload({
            conversation: state.conversations.find(
              (entry) => entry.id === operation.payload.conversationId
            ) || null,
            user: state.user,
            text: operation.payload.text,
          });
          if (!isSessionIdentityCurrent(get, replaySession)) return;
          await sendMessageRequest(
            operation.payload.conversationId,
            {
              ...messagePayload,
              clientMessageId: durableClientMessageId,
            }
          );
        } else if (operation.type === 'chat:sendVoice') {
          const { conversationId, fileUri, fileName, fileType, durationSeconds, caption } = operation.payload;
          const formData = new FormData();
          formData.append('durationSeconds', String(durationSeconds));
          formData.append('caption', caption);
          formData.append('file', { uri: fileUri, name: fileName, type: fileType } as any);
          await sendVoiceMessageRequest(conversationId, formData);
        } else if (operation.type === 'chat:sendMedia') {
          const { conversationId, fileUri, fileName, fileType, caption } = operation.payload;
          const formData = new FormData();
          formData.append('file', { uri: fileUri, name: fileName, type: fileType } as any);
          if (caption) formData.append('caption', caption);
          await sendMediaMessageRequest(conversationId, formData);
        } else if (operation.type === 'notification:markRead') {
          await markNotificationReadRequest(operation.payload.notificationId);
        } else if (operation.type === 'user:updateProfile') {
          await updateProfileRequest(operation.payload);
        } else if (operation.type === 'vehicle:location') {
          await updateVehicleLocationRequest(operation.payload);
        }

        if (!isSessionIdentityCurrent(get, replaySession)) return;
        await removePendingSyncOperation(operation.id);
      } catch (error) {
        if (!isSessionIdentityCurrent(get, replaySession)) return;
        const nextOperation: PendingSyncOperation = {
          ...operation,
          attempts: operation.attempts + 1,
        };
        await replacePendingSyncOperation(nextOperation);
        if (!isSessionIdentityCurrent(get, replaySession)) return;

        if (isProbablyNetworkError(error)) {
          set({ networkStatus: 'offline' });
          break;
        }

        logStoreError(`pendingSync:${operation.type}`, error);
      }
    }

    if (!isSessionIdentityCurrent(get, replaySession)) return;
    await refreshPendingSyncCount(set);
    if (!isSessionIdentityCurrent(get, replaySession)) return;
    await get().refreshAll();
  } finally {
    pendingSyncInFlight = false;
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  apiUrl: API_URL, token: null, refreshToken: null, sessionPersistence: 'memory', connectionMode: 'online', networkStatus: 'unknown', socketStatus: 'idle', realtimeDiagnostics: { heartbeatLatencyMs: null, lastPingAt: null, lastPongAt: null, lastSocketTransitionAt: null, missedHeartbeatAcks: 0, reconnectAttempts: 0, reason: null, operationalSocketReceivedAt: null, operationalAppliedAt: null, operationalReceiveToApplyMs: null, operationalUnitId: null }, networkSnapshot: null, pendingSyncCount: 0, lastSyncedAt: null, lastCacheAt: null, themeMode: 'light', isHydrated: false, isBootstrapping: true, isRefreshing: false, isSubmitting: false, isSigningOut: false, accountSuspended: false, updateInfo: null,
  authContext: null, user: null, mapData: null, operationalUnits: [], resources: idleMobileResources(), incidents: [], conversations: [], chatContacts: [], presenceByUser: {}, messagesByConversation: {}, chatPageInfoByConversation: {}, isLoadingOlderChatByConversation: {}, documents: [], notifications: [], users: [], activeRouteSession: null, routeSessionHistory: [],
  deviceLocation: { loading: true, permission: 'undetermined', backgroundPermission: 'undetermined', coordinates: null, lastUpdatedAt: null, servicesEnabled: true, issue: null, retryCount: 0 },
  refreshDeviceLocation: async () => undefined,
  syncBackgroundLocationCredentials: async (token, refreshToken) => {
    if (!token || !refreshToken || get().isSigningOut || !get().user) return;
    const session = captureSessionIdentity(get);
    setAuthToken(token);
    if (get().sessionPersistence === 'persistent') {
      await persistSession(token, get().connectionMode, refreshToken);
    } else {
      await persistSession(null, null);
    }
    if (!isSessionIdentityCurrent(get, session)) return;
    set({ token, refreshToken });
  },
  activeConversationId: null, focusedIncidentId: null, typingByConversation: {}, readByConversation: {}, isLoadingConversation: false, isLoadingChatContacts: false, error: null,
  clearError: () => set({ error: null }),
  setActiveConversationId: (id) => {
    if (get().activeConversationId === id || get().isSigningOut) return;
    set({ activeConversationId: id });
    socket?.emit('conversation:join', id);
  },
  setFocusedIncidentId: (id) => set({ focusedIncidentId: id }),
  markAsRead: (conversationId, messageId) => {
    const s = get();
    if (!s.user || s.isSigningOut) return;
    const ackSession = captureSessionIdentity(get);
    const ackSocket = socket;
    const existing = s.readByConversation[conversationId] || new Set();
    if (existing.has(messageId)) return;
    ackSocket?.emit('chat:read', { conversationId, messageId }, (ack: { ok?: boolean } = {}) => {
      if (
        !ack.ok ||
        socket !== ackSocket ||
        !isSessionIdentityCurrent(get, ackSession)
      ) return;
      set(current => ({
        conversations: current.conversations.map(conversation =>
          conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation
        ),
      }));
    });
  },
  emitTyping: (conversationId, isTyping) => {
    const s = get();
    if (!s.user || s.isSigningOut) return;
    if (isTyping) {
      socket?.emit('chat:typing', { conversationId, userId: s.user.id, userName: s.user.name });
    } else {
      socket?.emit('chat:typing:stop', { conversationId, userId: s.user.id });
    }
  },
  initialize: async () => {
    configureMobileRuntime(set, get);
    const epoch = getSessionEpoch();
    set({ isBootstrapping: true, error: null });
    try {
      const [t, rt, m, th, cached, queue, networkSnapshot] = await Promise.all([
        getStoredItem(TOKEN_KEY),
        getStoredItem(REFRESH_TOKEN_KEY),
        getStoredItem(MODE_KEY),
        getStoredItem(THEME_KEY),
        loadOfflineCache().catch(() => null),
        loadPendingSyncQueue().catch(() => []),
        getMobileNetworkSnapshot().catch(() => null),
      ]);
      const connectionMode = m === 'local' ? 'local' : 'online';
      set({
        networkSnapshot,
        networkStatus: isNetworkReachable(networkSnapshot) ? 'online' : 'offline',
        pendingSyncCount: queue.length,
        sessionPersistence: t ? 'persistent' : 'memory',
      });
      if (!t) {
        await clearTenantCache();
        set({
          ...getEmptyOperationalState(),
          connectionMode,
          token: null,
          refreshToken: null,
          sessionPersistence: 'memory',
          authContext: null,
          user: null,
          isHydrated: true,
          isBootstrapping: false,
          themeMode: th === 'dark' ? 'dark' : 'light',
        });
        return;
      }
      setAuthToken(t);
      let sessionToken = t;
      let nextRefreshToken = rt;
      let s: SessionResult;
      try {
        // `/auth/me` already owns 401 recovery through the Axios interceptor.
        // A second manual refresh here could replay a rotating refresh token.
        s = await getSessionRequest({ coldStart: true, appVersion: APP_VERSION });
        sessionToken = get().token || sessionToken;
        nextRefreshToken = get().refreshToken || nextRefreshToken;
      } catch (error) {
        // Sesion invalidada mientras `/auth/me` estaba en vuelo. `clearSessionState`
        // es dueño del estado resultante (incluidos `isBootstrapping`/`isHydrated`).
        if (isSessionEpochStale(epoch)) return;
        if (isTransientSessionFailure(error)) {
          const startupError = getReadableErrorMessage(
            error,
            'No pudimos conectar con el servidor. Reintenta cuando responda.',
            networkSnapshot
          );

          if (cached?.user) {
            const cachedState = stateFromCache(cached);
            const hasCachedAuthority = Boolean(cachedState.authContext);
            set({
              ...getEmptyOperationalState(),
              ...cachedState,
              connectionMode,
              token: get().token || sessionToken,
              refreshToken: get().refreshToken || nextRefreshToken,
              themeMode: th === 'dark' ? 'dark' : 'light',
              isHydrated: true,
              isBootstrapping: false,
              networkStatus: isProbablyNetworkError(error) ? 'offline' : 'recovering',
              error: hasCachedAuthority ? null : startupError,
            });
            return;
          }

          // Keep persisted credentials for an explicit retry, without leaving a
          // stale Authorization header active while recovery is shown.
          setAuthToken(null);
          set({
            ...getEmptyOperationalState(),
            connectionMode,
            token: null,
            refreshToken: null,
            authContext: null,
            user: null,
            themeMode: th === 'dark' ? 'dark' : 'light',
            isHydrated: false,
            isBootstrapping: false,
            networkStatus: isProbablyNetworkError(error) ? 'offline' : 'recovering',
            error: startupError,
          });
          return;
        }
        throw error;
      }
      const cachedUser = cached?.user;
      const cachedIdentityChanged = Boolean(
        cachedUser &&
        (
          cachedUser.id !== s.profile.user.id ||
          String(cachedUser.organizationId || '') !== String(s.profile.user.organizationId || '')
        )
      );

      if (cachedIdentityChanged) {
        await clearTenantCache();
        set(getEmptyOperationalState());
      }

      const authContext = getAuthContextFromPayload(s);
      // Idem: la sesion ya fue cerrada, no reescribimos nada sobre `clearSessionState`.
      if (isSessionEpochStale(epoch)) return;
      if (s.updateAvailable !== undefined) {
        const updateInfoPayload = {
          updateAvailable: s.updateAvailable,
          latestVersion: s.latestVersion || '',
          mandatory: s.mandatory || false,
          releaseNotes: s.releaseNotes || [],
          downloadUrl: s.downloadUrl || '',
        };
        set({ updateInfo: updateInfoPayload });
      }
      set({ authContext, connectionMode, token: sessionToken, refreshToken: nextRefreshToken, themeMode: th === 'dark' ? 'dark' : 'light', user: s.profile.user, documents: s.profile.documents, isHydrated: true, isBootstrapping: false, networkStatus: 'online', error: null });
      registerCurrentPushToken();
      persistOfflineSnapshot(get);
      connectSocket(set, get);
      if (shouldRefreshOperationalData(authContext, s.profile.user)) {
        get().refreshAll();
      }
    } catch (error) {
      logStoreError('initialize', error);
      if (isAuthoritativeSessionFailure(error)) {
        await clearSessionState(set, 'Sesion expirada.');
      } else {
        set({
          error: getReadableErrorMessage(
            error,
            'No pudimos validar tu sesion. Reintenta cuando el servidor responda.',
            get().networkSnapshot
          ),
          isHydrated: true,
          isBootstrapping: false,
          networkStatus: isProbablyNetworkError(error) ? 'offline' : 'recovering',
        });
      }
    }
  },
  signIn: async (e, p, r = true) => {
    set({ isSubmitting: true, error: null, accountSuspended: false });
    try {
      const res = await loginRequest(e, p, APP_VERSION, BUILD_NUMBER);
      if (res.updateAvailable !== undefined) {
        const info = {
          updateAvailable: res.updateAvailable,
          latestVersion: res.latestVersion || '',
          mandatory: res.mandatory || false,
          releaseNotes: res.releaseNotes || [],
          downloadUrl: res.downloadUrl || '',
        };
        set({ updateInfo: info });
      }
      const { authContext, session } = await replaceSessionFromBackend(
        set,
        get,
        res.token,
        res.refreshToken,
        r
      );
      const e2eeUser = await initializeE2eeIdentity(session.profile.user, p).catch((error) => {
        logStoreError('signIn:e2ee', error);
        return null;
      });
      if (e2eeUser) set({ user: e2eeUser });
      if (shouldRefreshOperationalData(authContext, session.profile.user)) {
        void get().refreshAll();
      }
      registerCurrentPushToken();
      persistOfflineSnapshot(get);
      connectSocket(set, get);
      return { ok: true };
    } catch (err) { const msg = getReadableErrorMessage(err, 'Error al iniciar sesion.', get().networkSnapshot); logStoreError('signIn', err); set({ error: msg }); return { ok: false, message: msg }; }
    finally { set({ isSubmitting: false }); }
  },
  signOut: async () => {
    // El epoch se invalida ANTES de cualquier await. Esto corta refresh/replay y
    // callbacks realtime de la identidad anterior de forma sincronica.
    beginSessionEpoch();
    set({ isSigningOut: true, error: null });
    disconnectSocket();
    await hardResetBackgroundLocationServiceAsync().catch(() => undefined);

    const [rt, pt] = await Promise.all([
      get().refreshToken || getStoredItem(REFRESH_TOKEN_KEY),
      getStoredItem(PUSH_TOKEN_KEY),
    ]);

    // El DELETE push ocurre mientras el bearer/sid aun es valido. Si falla por
    // red/token expirado, /auth/logout recibe el mismo token como fallback y lo
    // elimina usando el sub firmado antes de completar la revocacion.
    let pushTokenForLogout: string | null = null;
    if (pt) {
      try {
        await unregisterPushSubscriptionRequest(pt);
      } catch (error) {
        pushTokenForLogout = pt;
        logStoreError('signOut:pushUnregister', error);
      }
      await deleteStoredItem(PUSH_TOKEN_KEY);
    }

    await logoutRequest(rt, pushTokenForLogout).catch((error) => {
      logStoreError('signOut:serverLogout', error);
    });
    await clearSessionState(set);
  },
  setThemeMode: async (m) => { await setStoredItem(THEME_KEY, m); set({ themeMode: m }); },
  refreshAll: async () => {
    const refreshEpoch = getSessionEpoch();
    if (refreshAllInFlight?.epoch === refreshEpoch) {
      return refreshAllInFlight.promise;
    }

    const refreshOperation = (async () => {
    const { token, user: currentUser, isSigningOut } = get();
    if (!token || !currentUser || isSigningOut) return;
    const epoch = refreshEpoch;
    set((state) => ({
      isRefreshing: true,
      resources: Object.fromEntries(
        mobileResourceDomains.map((domain) => [domain, beginResourceAttempt(state.resources[domain])])
      ) as Record<MobileResourceDomain, ResourceState>,
    }));
    try {
      const refreshed = await refreshAuthSession(set, epoch);
      if (isSessionEpochStale(epoch)) return;
      const authContext = refreshed.authContext;
      const user = refreshed.session.profile.user;

      if (!shouldRefreshOperationalData(authContext, user)) {
        if (isSessionEpochStale(epoch)) return;
        set({
          ...getEmptyOperationalState(),
          authContext,
          user,
          isRefreshing: false,
          isHydrated: true,
          isBootstrapping: false,
          networkStatus: 'online',
          error: null,
        });
        persistOfflineSnapshot(get);
        connectSocket(set, get);
        return;
      }

      const curr = get();
      if (isSessionEpochStale(epoch)) return;
      const res = await Promise.allSettled([
        getLocationsRequest(), getOperationalUnitsRequest(), getIncidentsRequest(), getConversationsRequest(), getChatContactsRequest(),
        getDocumentsRequest(), getNotificationsRequest(),
        canLoadDirectoryUsers(user) ? getUsersRequest() : Promise.resolve([]),
        user.vehicleId ? getActiveRouteSessionRequest(user.vehicleId) : Promise.resolve(null),
        getRouteSessionHistoryRequest({ limit: 500 })
      ]);
      const data: any = {};
      const keys = ['mapData', 'operationalUnits', 'incidents', 'conversations', 'chatContacts', 'documents', 'notifications', 'users', 'activeRouteSession', 'routeSessionHistory'];
      let fulfilledCount = 0;
      res.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          data[keys[i]] =
            keys[i] === 'mapData'
              ? normalizeLiveLocationsData(r.value as LiveLocationsData)
              : r.value;
          fulfilledCount += 1;
        }
      });
      const resourceIndex: Partial<Record<MobileResourceDomain, number>> = {
        mapData: 0,
        operationalUnits: 1,
        incidents: 2,
        conversations: 3,
        documents: 5,
        notifications: 6,
        users: 7,
        routeSessionHistory: 9,
      };
      const resourceStates = { ...get().resources };
      for (const domain of mobileResourceDomains) {
        const result = res[resourceIndex[domain]!];
        if (result.status === 'fulfilled') {
          const value = data[domain];
          const empty = Array.isArray(value)
            ? value.length === 0
            : domain === 'mapData'
              ? !value || !Array.isArray(value.vehicles) || value.vehicles.length === 0
              : value == null;
          resourceStates[domain] = completeResourceAttempt(resourceStates[domain], { empty, source: 'rest' });
        } else {
          resourceStates[domain] = failResourceAttempt(resourceStates[domain], {
            errorCode: isAxiosError(result.reason)
              ? String(result.reason.response?.status || result.reason.code || 'request_failed')
              : 'request_failed',
            errorMessage: getReadableErrorMessage(result.reason, `No se pudo actualizar ${domain}.`, get().networkSnapshot),
          });
        }
      }
      data.resources = resourceStates;

      // La autoridad de cuenta y el perfil se reconciliaron al inicio mediante
      // /auth/me. Si la unidad cambio desde el snapshot previo, reconsultamos su
      // jornada usando la asignacion vigente.
      data.user = user;
      if (user.vehicleId && user.vehicleId !== (currentUser.vehicleId || null)) {
        data.activeRouteSession = await getActiveRouteSessionRequest(user.vehicleId).catch(() => null);
      }

      if (res.some((result) => result.status === 'rejected' && isPlanRequiredError(result.reason))) {
        await clearOfflineCache().catch(() => undefined);
        let nextAuthContext: AuthRoutingContext | null = null;

        try {
          nextAuthContext = (await refreshAuthSession(set, epoch)).authContext;
        } catch (error) {
          logStoreError('refreshAll:planRequiredSession', error);
        }

        if (isSessionEpochStale(epoch)) return;
        set({
          ...getEmptyOperationalState(),
          authContext: nextAuthContext,
          isHydrated: true,
          isBootstrapping: false,
          error: PLAN_REQUIRED_MESSAGE,
        });
        return;
      }

      if (fulfilledCount === 0) {
        const cached = await loadOfflineCache().catch(() => null);
        if (isSessionEpochStale(epoch)) return;
        if (cached) {
          set({
            ...stateFromCache(cached),
            isRefreshing: false,
            isHydrated: true,
            isBootstrapping: false,
            networkStatus: 'offline',
            error: 'Sin conexion. Datos en cache.',
          });
          return;
        }
      }

      if (data.conversations) {
        data.conversations = sortConversations(data.conversations.map((conversation: ConversationSummary) => ({
          ...conversation,
          participants: conversation.participants.map(participant => ({
            ...participant,
            status: curr.presenceByUser[participant.id] || 'offline',
          })),
        })));
      }
      if (data.chatContacts) {
        data.chatContacts = data.chatContacts.map((contact: ChatDirectoryContact) => ({
          ...contact,
          status: curr.presenceByUser[contact.id] || 'offline',
        }));
      }
      const aid = curr.activeConversationId || data.conversations?.[0]?.id || null;
      if (aid) {
        try {
          const availableConversations = data.conversations || curr.conversations;
          const activeConversation = availableConversations.find(
            (conversation: ConversationSummary) => conversation.id === aid
          );
          const page = activeConversation?.channelMode === 'chat'
            ? await getMessagesPageRequest(aid)
            : null;
          const ms = page ? page.items : await getMessagesRequest(aid);
          const hms = await hydrateMessages(ms, availableConversations, get().user, aid);
          data.messagesByConversation = { ...curr.messagesByConversation, [aid]: hms };
          if (page) {
            data.chatPageInfoByConversation = {
              ...curr.chatPageInfoByConversation,
              [aid]: page.pageInfo,
            };
          }
          data.activeConversationId = aid;
        } catch (error) {
          logStoreError('refreshAll:messages', error);
        }
      }
      if (aid && data.messagesByConversation?.[aid]) {
        const latestMessages = get().messagesByConversation;
        data.messagesByConversation = {
          ...latestMessages,
          [aid]: mergeConversationMessages(latestMessages[aid] || [], data.messagesByConversation[aid]),
        };
      }
      if (isSessionEpochStale(epoch)) return;
      if (data.operationalUnits) {
        data.operationalUnits = mergeOperationalUnitsByFreshness(get().operationalUnits, data.operationalUnits);
      }
      if (data.mapData?.vehicles) {
        const liveById = new Map((get().mapData?.vehicles || []).map(vehicle => [vehicle.id, vehicle]));
        data.mapData = {
          ...data.mapData,
          vehicles: data.mapData.vehicles.map((vehicle: Vehicle) => {
            const existing = liveById.get(vehicle.id);
            return existing && timestampMs(existing.locationTimestamp) > timestampMs(vehicle.locationTimestamp)
              ? existing
              : vehicle;
          }),
        };
      }
      set({ ...data, isRefreshing: false, isHydrated: true, isBootstrapping: false, networkStatus: 'online', error: null });
      persistOfflineSnapshot(get);
      connectSocket(set, get);
    } catch (error) {
      logStoreError('refreshAll', error);
      if (isSessionEpochStale(epoch)) return;
      if (isProbablyNetworkError(error)) {
        const cached = await loadOfflineCache().catch(() => null);
        if (isSessionEpochStale(epoch)) return;
        const cachedState = stateFromCache(cached);
        const hasAuthority = Boolean(cachedState.authContext || get().authContext);
        set({
          ...cachedState,
          isRefreshing: false,
          isHydrated: true,
          isBootstrapping: false,
          networkStatus: 'offline',
          error: hasAuthority
            ? null
            : getReadableErrorMessage(
                error,
                'No pudimos validar tu sesion. Reintenta cuando el servidor responda.',
                get().networkSnapshot
              ),
        });
        return;
      }
      set({
        isRefreshing: false,
        resources: Object.fromEntries(mobileResourceDomains.map((domain) => [
          domain,
          failResourceAttempt(get().resources[domain], {
            errorCode: isAxiosError(error) ? String(error.response?.status || error.code || 'request_failed') : 'request_failed',
            errorMessage: getReadableErrorMessage(error, `No se pudo actualizar ${domain}.`, get().networkSnapshot),
          }),
        ])) as Record<MobileResourceDomain, ResourceState>,
        error: getReadableErrorMessage(
          error,
          'No pudimos sincronizar tu cuenta.',
          get().networkSnapshot
        ),
      });
    }
    })();

    refreshAllInFlight = { epoch: refreshEpoch, promise: refreshOperation };
    try {
      await refreshOperation;
    } finally {
      if (refreshAllInFlight?.promise === refreshOperation) {
        refreshAllInFlight = null;
      }
    }
  },
  flushPendingSync: async () => {
    await processPendingSyncQueue(set, get);
  },
  sendVehicleLocation: async (payload) => {
    const durablePayload = {
      ...payload,
      packetId: payload.packetId || createRealtimePacketId('gps'),
      sessionId: typeof payload.sessionId === 'undefined'
        ? (get().activeRouteSession?.status === 'RUNNING' ? get().activeRouteSession?.id || null : null)
        : payload.sessionId,
    };
    try {
      const response = await updateVehicleLocationRequest(durablePayload);
      const vehicle = normalizeVehicle(response.data);
      set(s => ({
        mapData: s.mapData
          ? {
              ...s.mapData,
              vehicles: s.mapData.vehicles.map((entry) =>
                entry.id === vehicle.id ? normalizeVehicle({ ...entry, ...vehicle }) : entry
              ),
              updatedAt: new Date().toISOString(),
            }
          : s.mapData,
      }));
      mobileLog('gps-sync', 'vehicle location confirmed', {
        accepted: response.accepted,
        decision: response.decision,
        httpStatus: response.httpStatus,
        packetId: response.packetId,
        sessionIdPresent: Boolean(durablePayload.sessionId),
        timestamp: durablePayload.timestamp || null,
        vehicleId: durablePayload.vehicleId,
      });
      return { ok: response.accepted, message: response.decision };
    } catch (error) {
      if (isProbablyNetworkError(error)) {
        await enqueuePendingSyncOperation({
          type: 'vehicle:location',
          payload: durablePayload,
        });
        await refreshPendingSyncCount(set);
        set({ networkStatus: 'offline' });
        mobileLog('gps-sync', 'vehicle location queued', {
          accepted: false,
          backendCode: null,
          httpStatus: null,
          packetId: durablePayload.packetId,
          sessionIdPresent: Boolean(durablePayload.sessionId),
          timestamp: durablePayload.timestamp || null,
          vehicleId: durablePayload.vehicleId,
        });
        return { ok: true, message: 'Ubicacion guardada para sincronizar.' };
      }

      logStoreError('sendVehicleLocation', error);
      mobileLog('gps-sync', 'vehicle location failed', {
        accepted: false,
        backendCode: isAxiosError(error) ? error.response?.data?.code || null : null,
        httpStatus: isAxiosError(error) ? error.response?.status || null : null,
        packetId: durablePayload.packetId,
        sessionIdPresent: Boolean(durablePayload.sessionId),
        timestamp: durablePayload.timestamp || null,
        vehicleId: durablePayload.vehicleId,
      });
      return {
        ok: false,
        message: getReadableErrorMessage(error, 'No fue posible actualizar la ubicacion.'),
      };
    }
  },
  sendMessage: async (cid, t, requestedClientMessageId) => {
    const clientMessageId =
      normalizeClientMessageId(requestedClientMessageId) || createClientMessageId();
    const { user } = get();
    if (!t.trim() || !user) {
      return { ok: false, message: 'El mensaje no puede ir vacio.' };
    }
    const session = captureSessionIdentity(get);
    set({ isSubmitting: true });
    try {
      const conversation = get().conversations.find(e => e.id === cid) || null;
      const payload = await buildTextMessagePayload({ conversation, user, text: t });
      if (!isSessionIdentityCurrent(get, session)) {
        return { ok: false, message: 'La sesion cambio antes de enviar el mensaje.' };
      }
      const m = await sendMessageRequest(cid, { ...payload, clientMessageId });
      if (!isSessionIdentityCurrent(get, session)) {
        return { ok: false, message: 'La sesion cambio antes de confirmar el mensaje.' };
      }
      const h = await hydrateConversationMessage(m, conversation, user);
      if (!isSessionIdentityCurrent(get, session)) {
        return { ok: false, message: 'La sesion cambio antes de guardar el mensaje.' };
      }
      set(s => ({
        messagesByConversation: upsertConversationMessage(s.messagesByConversation, cid, h),
        conversations: sortConversations(s.conversations.map(c => c.id === cid ? { ...c, lastMessage: h } : c))
      }));
      return { ok: true, messageRecord: h };
    } catch (error) {
      if (!isSessionIdentityCurrent(get, session)) {
        return { ok: false, message: 'La sesion cambio antes de completar el mensaje.' };
      }
      logStoreError('sendMessage', error);
      if (isProbablyNetworkError(error)) {
        await enqueuePendingSyncOperation({
          type: 'chat:sendMessage',
          payload: {
            conversationId: cid,
            text: t.trim(),
            clientMessageId,
          },
        });
        await refreshPendingSyncCount(set);
        set({ networkStatus: 'offline', error: 'Mensaje guardado para sincronizar.' });
        return { ok: true, message: 'Mensaje guardado para sincronizar.' };
      }
      return {
        ok: false,
        message: getReadableErrorMessage(error, 'No fue posible enviar el mensaje.'),
      };
    } finally {
      if (isSessionIdentityCurrent(get, session)) set({ isSubmitting: false });
    }
  },
  createIncident: async (d) => {
    set({ isSubmitting: true });
    try {
      const i = await createIncidentRequest(d);
      set(s => {
        const incident = enrichIncidentFromState(s, i);
        return {
          incidents: upsertIncident(s.incidents, incident),
          mapData: applyIncidentToMapData(s.mapData, incident),
        };
      });
      return true;
    } catch (error) {
      logStoreError('createIncident', error);
      if (isProbablyNetworkError(error)) {
        await enqueuePendingSyncOperation({
          type: 'incident:create',
          payload: d,
        });
        await refreshPendingSyncCount(set);
        set({ networkStatus: 'offline', error: 'Incidencia guardada para sincronizar.' });
        return true;
      }
      return false;
    } finally { set({ isSubmitting: false }); }
  },
  register: async (p, r = true) => {
    set({ isSubmitting: true, error: null });
    try {
      const res = await registerRequest(p);
      const { authContext, session } = await replaceSessionFromBackend(
        set,
        get,
        res.token,
        res.refreshToken,
        r
      );
      const e2eeUser = await initializeE2eeIdentity(session.profile.user, p.password).catch((error) => {
        logStoreError('register:e2ee', error);
        return null;
      });
      if (e2eeUser) set({ user: e2eeUser });
      if (shouldRefreshOperationalData(authContext, session.profile.user)) {
        await get().refreshAll();
      }
      connectSocket(set, get);
      registerCurrentPushToken();
      persistOfflineSnapshot(get);
      return { ok: true };
    } catch (err) { const msg = getReadableErrorMessage(err, 'Error al registrar.', get().networkSnapshot); logStoreError('register', err); set({ error: msg }); return { ok: false, message: msg }; }
    finally { set({ isSubmitting: false }); }
  },
  activateDriverWithKey: async (p, r = true) => {
    set({ isSubmitting: true, error: null });
    try {
      const res = await registerDriverActivationRequest(p);
      const { authContext, session } = await replaceSessionFromBackend(
        set,
        get,
        res.token,
        res.refreshToken,
        r
      );
      const e2eeUser = await initializeE2eeIdentity(session.profile.user, p.password).catch((error) => {
        logStoreError('activateDriverWithKey:e2ee', error);
        return null;
      });
      if (e2eeUser) set({ user: e2eeUser });
      if (shouldRefreshOperationalData(authContext, session.profile.user)) {
        await get().refreshAll();
      }
      connectSocket(set, get);
      registerCurrentPushToken();
      persistOfflineSnapshot(get);
      return { ok: true };
    } catch (err) {
      const msg = getReadableErrorMessage(err, 'No se pudo activar la cuenta. Intenta nuevamente.', get().networkSnapshot);
      logStoreError('activateDriverWithKey', err);
      set({ error: msg });
      return { ok: false, message: msg };
    } finally {
      set({ isSubmitting: false });
    }
  },
  forgotPassword: async (email) => {
    set({ isSubmitting: true, error: null });
    try {
      const res = await forgotPasswordRequest(email);
      set({ error: null });
      return { ok: true, message: res.message };
    } catch (err) {
      const msg = getReadableErrorMessage(err, 'No fue posible procesar la solicitud.');
      logStoreError('forgotPassword', err);
      set({ error: msg });
      return { ok: false, message: msg };
    } finally {
      set({ isSubmitting: false });
    }
  },
  resetPassword: async (token, password) => {
    set({ isSubmitting: true, error: null });
    try {
      const res = await resetPasswordRequest(token, password);
      set({ error: null });
      return { ok: true, message: res.message };
    } catch (err) {
      const msg = getReadableErrorMessage(err, 'No fue posible restablecer la contrasena.');
      logStoreError('resetPassword', err);
      set({ error: msg });
      return { ok: false, message: msg };
    } finally {
      set({ isSubmitting: false });
    }
  },
  updateProfile: async (p) => {
    set({ isSubmitting: true });
    try {
      const u = await updateProfileRequest(p);
      set(s => ({
        user: u,
        users: s.users.map(eu => eu.id === u.id ? u : eu),
      }));
      return { ok: true };
    } catch (error) {
      logStoreError('updateProfile', error);
      if (isProbablyNetworkError(error)) {
        await enqueuePendingSyncOperation({
          type: 'user:updateProfile',
          payload: p,
        });
        await refreshPendingSyncCount(set);
        set({ networkStatus: 'offline', error: 'Cambio guardado para sincronizar.' });
        return { ok: true, message: 'Cambio guardado para sincronizar cuando haya conexion.' };
      }
      const message = getReadableErrorMessage(error, 'Error al actualizar.');
      set({ error: message });
      return { ok: false, message };
    }
    finally { set({ isSubmitting: false }); }
  },
  loadUsers: async () => {
    const currentUser = get().user;
    if (!canLoadDirectoryUsers(currentUser)) return;

    try {
      set({ users: await getUsersRequest() });
    } catch (error) {
      logStoreError('loadUsers', error);
      if (isProbablyNetworkError(error)) {
        const cached = get().users;
        if (cached.length) {
          set({ networkStatus: 'offline', error: 'Mostrando datos guardados. Conectate para actualizar.' });
          return;
        }
      }
      throw error;
    }
  },
  loadConversation: async (id) => {
    const session = captureSessionIdentity(get);
    if (!isSessionIdentityCurrent(get, session)) return;
    set({ isLoadingConversation: true });
    try {
      const ms = await getMessagesRequest(id);
      if (!isSessionIdentityCurrent(get, session)) return;
      const hms = await hydrateMessages(ms, get().conversations, get().user, id);
      if (!isSessionIdentityCurrent(get, session)) return;
      set(s => ({
        messagesByConversation: {
          ...s.messagesByConversation,
          [id]: mergeConversationMessages(s.messagesByConversation[id] || [], hms),
        },
      }));
      socket?.emit('conversation:join', id);
    } catch (error) {
      if (isSessionIdentityCurrent(get, session)) logStoreError('loadConversation', error);
    } finally {
      if (isSessionIdentityCurrent(get, session)) set({ isLoadingConversation: false });
    }
  },
  loadChatConversation: async (id) => {
    const session = captureSessionIdentity(get);
    if (!isSessionIdentityCurrent(get, session)) return;
    set({ isLoadingConversation: true });
    try {
      const page = await getMessagesPageRequest(id);
      if (!isSessionIdentityCurrent(get, session)) return;
      const hydrated = await hydrateMessages(page.items, get().conversations, get().user, id);
      if (!isSessionIdentityCurrent(get, session)) return;
      set(state => ({
        messagesByConversation: {
          ...state.messagesByConversation,
          [id]: mergeConversationMessages(state.messagesByConversation[id] || [], hydrated),
        },
        chatPageInfoByConversation: {
          ...state.chatPageInfoByConversation,
          [id]: page.pageInfo,
        },
      }));
      socket?.emit('conversation:join', id);
    } catch (error) {
      if (isSessionIdentityCurrent(get, session)) logStoreError('loadChatConversation', error);
    } finally {
      if (isSessionIdentityCurrent(get, session)) set({ isLoadingConversation: false });
    }
  },
  loadOlderChatMessages: async (id) => {
    const session = captureSessionIdentity(get);
    const current = get();
    const pageInfo = current.chatPageInfoByConversation[id];
    if (
      !isSessionIdentityCurrent(get, session) ||
      current.isLoadingOlderChatByConversation[id] ||
      !pageInfo?.hasMore ||
      !pageInfo.nextCursor
    ) {
      return;
    }
    set(state => ({
      isLoadingOlderChatByConversation: {
        ...state.isLoadingOlderChatByConversation,
        [id]: true,
      },
    }));
    try {
      const page = await getMessagesPageRequest(id, { before: pageInfo.nextCursor });
      if (!isSessionIdentityCurrent(get, session)) return;
      const hydrated = await hydrateMessages(page.items, get().conversations, get().user, id);
      if (!isSessionIdentityCurrent(get, session)) return;
      set(state => ({
        messagesByConversation: {
          ...state.messagesByConversation,
          [id]: mergeConversationMessages(hydrated, state.messagesByConversation[id] || []),
        },
        chatPageInfoByConversation: {
          ...state.chatPageInfoByConversation,
          [id]: page.pageInfo,
        },
      }));
    } catch (error) {
      if (isSessionIdentityCurrent(get, session)) logStoreError('loadOlderChatMessages', error);
    } finally {
      if (isSessionIdentityCurrent(get, session)) {
        set(state => ({
          isLoadingOlderChatByConversation: {
            ...state.isLoadingOlderChatByConversation,
            [id]: false,
          },
        }));
      }
    }
  },
  loadChatContacts: async () => {
    set({ isLoadingChatContacts: true });
    try {
      const contacts = await getChatContactsRequest();
      set(state => ({
        chatContacts: contacts.map(contact => ({
          ...contact,
          status: state.presenceByUser[contact.id] || 'offline',
        })),
      }));
    } catch (error) {
      logStoreError('loadChatContacts', error);
      throw error;
    }
    finally { set({ isLoadingChatContacts: false }); }
  },
  openDirectConversation: async (tid, m = 'chat') => {
    const session = captureSessionIdentity(get);
    if (!isSessionIdentityCurrent(get, session)) return null;
    try {
      const responseConversation = await openDirectConversationRequest(tid, m);
      if (!isSessionIdentityCurrent(get, session)) return null;
      const c = {
        ...responseConversation,
        participants: responseConversation.participants.map(participant => ({
          ...participant,
          status: get().presenceByUser[participant.id] || 'offline',
        })),
      };
      const [page, cc] = await Promise.all([
        m === 'chat'
          ? getMessagesPageRequest(c.id)
          : getMessagesRequest(c.id).then(items => ({
              items,
              pageInfo: { hasMore: false, nextCursor: null },
            })),
        getChatContactsRequest(),
      ]);
      if (!isSessionIdentityCurrent(get, session)) return null;
      const ncs = upsertConversation(get().conversations, c);
      const hms = await hydrateMessages(page.items, ncs, get().user, c.id);
      if (!isSessionIdentityCurrent(get, session)) return null;
      set(s => ({
        conversations: ncs,
        chatContacts: cc.map(contact => ({
          ...contact,
          status: s.presenceByUser[contact.id] || 'offline',
        })),
        activeConversationId: c.id,
        messagesByConversation: {
          ...s.messagesByConversation,
          [c.id]: mergeConversationMessages(s.messagesByConversation[c.id] || [], hms),
        },
        ...(m === 'chat'
          ? {
              chatPageInfoByConversation: {
                ...s.chatPageInfoByConversation,
                [c.id]: page.pageInfo,
              },
            }
          : {}),
      }));
      socket?.emit('conversation:join', c.id); return c;
    } catch (error) {
      if (isSessionIdentityCurrent(get, session)) logStoreError('openDirectConversation', error);
      return null;
    }
  },
  openGeneralConversation: async (m = 'chat', options) => {
    // setActive=false permite asegurar/enrolarse en el canal general (el backend
    // resincroniza participantes) sin arrastrar el canal activo del usuario.
    const setActive = options?.setActive !== false;
    const session = captureSessionIdentity(get);
    if (!isSessionIdentityCurrent(get, session)) return null;
    try {
      const responseConversation = await openGeneralConversationRequest(m);
      if (!isSessionIdentityCurrent(get, session)) return null;
      const c = {
        ...responseConversation,
        participants: responseConversation.participants.map(participant => ({
          ...participant,
          status: get().presenceByUser[participant.id] || 'offline',
        })),
      };
      const page = m === 'chat'
        ? await getMessagesPageRequest(c.id)
        : {
            items: await getMessagesRequest(c.id),
            pageInfo: { hasMore: false, nextCursor: null },
          };
      if (!isSessionIdentityCurrent(get, session)) return null;
      const ncs = upsertConversation(get().conversations, c);
      const hms = await hydrateMessages(page.items, ncs, get().user, c.id);
      if (!isSessionIdentityCurrent(get, session)) return null;
      set(s => ({
        conversations: ncs,
        ...(setActive ? { activeConversationId: c.id } : {}),
        messagesByConversation: {
          ...s.messagesByConversation,
          [c.id]: mergeConversationMessages(s.messagesByConversation[c.id] || [], hms),
        },
        ...(m === 'chat'
          ? {
              chatPageInfoByConversation: {
                ...s.chatPageInfoByConversation,
                [c.id]: page.pageInfo,
              },
            }
          : {}),
      }));
      socket?.emit('conversation:join', c.id); return c;
    } catch (error) {
      if (isSessionIdentityCurrent(get, session)) logStoreError('openGeneralConversation', error);
      return null;
    }
  },
  sendVoiceMessage: async (cid, f) => {
    const { user } = get();
    if (!user) {
      return { ok: false, message: 'Debes iniciar sesion para enviar notas de voz.' };
    }
    const session = captureSessionIdentity(get);
    set({ isSubmitting: true });
    try {
      const m = await sendVoiceMessageRequest(cid, f);
      if (!isSessionIdentityCurrent(get, session)) {
        return { ok: false, message: 'La sesion cambio antes de confirmar la nota de voz.' };
      }
      const h = await hydrateConversationMessage(m, get().conversations.find(e => e.id === cid) || null, user);
      if (!isSessionIdentityCurrent(get, session)) {
        return { ok: false, message: 'La sesion cambio antes de guardar la nota de voz.' };
      }
      set(s => ({ messagesByConversation: upsertConversationMessage(s.messagesByConversation, cid, h), conversations: sortConversations(s.conversations.map(c => c.id === cid ? { ...c, lastMessage: h } : c)) }));
      return { ok: true, messageRecord: h };
    } catch (error) {
      if (!isSessionIdentityCurrent(get, session)) {
        return { ok: false, message: 'La sesion cambio antes de completar la nota de voz.' };
      }
      logStoreError('sendVoiceMessage', error);
      if (isProbablyNetworkError(error)) {
        const durationSeconds = Number(f.get('durationSeconds')) || 0;
        const caption = String(f.get('caption') || '');
        const file = f.get('file') as any;
        if (file?.uri) {
          await enqueuePendingSyncOperation({
            type: 'chat:sendVoice',
            payload: {
              conversationId: cid,
              fileUri: file.uri,
              fileName: file.name || `voice-note-${Date.now()}.m4a`,
              fileType: file.type || 'audio/mp4',
              durationSeconds,
              caption,
            },
          });
          await refreshPendingSyncCount(set);
          set({ networkStatus: 'offline', error: 'Nota de voz guardada para sincronizar.' });
          return { ok: true, message: 'Nota de voz guardada para sincronizar.' };
        }
      }
      return {
        ok: false,
        message: getReadableErrorMessage(error, 'No fue posible enviar la nota de voz.'),
      };
    } finally {
      if (isSessionIdentityCurrent(get, session)) set({ isSubmitting: false });
    }
  },
  sendMediaMessage: async (cid, f) => {
    const { user } = get();
    if (!user) {
      return { ok: false, message: 'Debes iniciar sesion para enviar archivos.' };
    }
    const session = captureSessionIdentity(get);
    set({ isSubmitting: true });
    try {
      const m = await sendMediaMessageRequest(cid, f);
      if (!isSessionIdentityCurrent(get, session)) {
        return { ok: false, message: 'La sesion cambio antes de confirmar el archivo.' };
      }
      const h = await hydrateConversationMessage(m, get().conversations.find(e => e.id === cid) || null, user);
      if (!isSessionIdentityCurrent(get, session)) {
        return { ok: false, message: 'La sesion cambio antes de guardar el archivo.' };
      }
      set(s => ({ messagesByConversation: upsertConversationMessage(s.messagesByConversation, cid, h), conversations: sortConversations(s.conversations.map(c => c.id === cid ? { ...c, lastMessage: h } : c)) }));
      return { ok: true, messageRecord: h };
    } catch (error) {
      if (!isSessionIdentityCurrent(get, session)) {
        return { ok: false, message: 'La sesion cambio antes de completar el archivo.' };
      }
      logStoreError('sendMediaMessage', error);
      if (isProbablyNetworkError(error)) {
        const caption = String(f.get('caption') || '');
        const file = f.get('file') as any;
        if (file?.uri) {
          await enqueuePendingSyncOperation({
            type: 'chat:sendMedia',
            payload: {
              conversationId: cid,
              fileUri: file.uri,
              fileName: file.name || `media-${Date.now()}`,
              fileType: file.type || 'application/octet-stream',
              caption,
            },
          });
          await refreshPendingSyncCount(set);
          set({ networkStatus: 'offline', error: 'Archivo guardado para sincronizar.' });
          return { ok: true, message: 'Archivo guardado para sincronizar.' };
        }
      }
      return {
        ok: false,
        message: getReadableErrorMessage(error, 'No fue posible enviar el archivo.'),
      };
    } finally {
      if (isSessionIdentityCurrent(get, session)) set({ isSubmitting: false });
    }
  },
  updateIncidentStatus: async (id, st) => {
    try {
      const i = await updateIncidentStatusRequest(id, st);
      set(s => {
        const incident = enrichIncidentFromState(s, i);
        return {
          incidents: upsertIncident(s.incidents, incident),
          mapData: applyIncidentToMapData(s.mapData, incident),
        };
      });
    } catch (error) {
      logStoreError('updateIncidentStatus', error);
      if (isProbablyNetworkError(error)) {
        await enqueuePendingSyncOperation({
          type: 'incident:updateStatus',
          payload: {
            incidentId: id,
            status: st,
          },
        });
        await refreshPendingSyncCount(set);
        set({ networkStatus: 'offline', error: 'Cambio guardado para sincronizar.' });
      } else {
        set({ error: getReadableErrorMessage(error, 'No fue posible actualizar el estado de la incidencia.') });
      }
    }
  },
  markNotificationRead: async (id) => {
    set(s => ({ notifications: s.notifications.map(e => e.id === id ? { ...e, isRead: true } : e) }));
    try {
      await markNotificationReadRequest(id);
    } catch (error) {
      logStoreError('markNotificationRead', error);
      if (isProbablyNetworkError(error)) {
        await enqueuePendingSyncOperation({
          type: 'notification:markRead',
          payload: { notificationId: id },
        });
        await refreshPendingSyncCount(set);
      } else {
        set({ error: getReadableErrorMessage(error, 'No fue posible marcar la notificacion como leida.') });
      }
    }
  },
  handlePushIntent: async (i) => {
    const session = captureSessionIdentity(get);
    if (!i || !isSessionIdentityCurrent(get, session)) return;
    if (i.notificationId) {
      await get().markNotificationRead(i.notificationId).catch(() => {});
      if (!isSessionIdentityCurrent(get, session)) return;
    }
    if (i.target === 'chat' || i.target === 'radio') {
      const m = i.target === 'radio' ? 'radio' : i.channelMode || 'chat';
      if (i.conversationId) {
        if (!get().conversations.some(c => c.id === i.conversationId)) {
          await get().refreshAll().catch(() => {});
          if (!isSessionIdentityCurrent(get, session)) return;
        }
        set({ activeConversationId: i.conversationId });
        if (i.target === 'chat') await get().loadChatConversation(i.conversationId);
        else await get().loadConversation(i.conversationId);
        return;
      }
      await get().openGeneralConversation(m); return;
    }
    if (i.target === 'sos' || i.target === 'incidents') {
      if (!isSessionIdentityCurrent(get, session)) return;
      if (i.incidentId) set({ focusedIncidentId: i.incidentId });
      await get().refreshAll().catch(() => {});
    }
  },
}));
