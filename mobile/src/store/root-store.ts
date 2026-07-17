import * as SecureStore from '@/src/native/secure-store';
import * as Haptics from '@/src/native/haptics';
import { AppState as NativeAppState, Platform } from 'react-native';
import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import { isAxiosError } from 'axios';
import type { ThemeMode } from '@/constants/theme';
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
  getActiveRouteSessionRequest,
  getRouteSessionHistoryRequest,
  getMessagesRequest,
  getNotificationsRequest,
  getOperationalObservabilityRequest,
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
  subscribeMobileNetwork,
  type MobileNetworkSnapshot,
} from '@/src/api/mobile-runtime';
import { stopBackgroundLocationServiceAsync } from '@/src/native/background-location';
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
  OperationalObservabilitySnapshot,
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
  isE2eeCapablePublicKey,
  type StoredChatKeyPair,
} from '@/src/utils/chat-e2ee';
import {
  configureAppNotifications,
  requestNativePushToken,
  showInAppNotification,
  type PushRouteIntent,
} from '@/src/utils/push-notifications';
import { normalizeLiveLocationsData, normalizeVehicle } from '@/src/utils/navigation-data';
import { buildPresenceSnapshot, markAllPresenceUnknown, type PresenceMap } from '@/src/utils/presence';

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

export function getSharedRealtimeSocket() {
  return socket;
}

type ActionResult = {
  ok: boolean;
  message?: string;
};

type NetworkStatus = 'unknown' | 'online' | 'offline' | 'recovering';
type SocketStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

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
};

export type AppState = {
  apiUrl: string;
  token: string | null;
  refreshToken: string | null;
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
  authContext: AuthRoutingContext | null;
  user: User | null;
  mapData: LiveLocationsData | null;
  incidents: Incident[];
  conversations: ConversationSummary[];
  chatContacts: ChatDirectoryContact[];
  presenceByUser: Record<string, 'online' | 'offline'>;
  messagesByConversation: Record<string, ChatMessage[]>;
  documents: DocumentItem[];
  notifications: NotificationItem[];
  observability: OperationalObservabilitySnapshot | null;
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
  loadChatContacts: () => Promise<void>;
  openDirectConversation: (
    targetUserId: string,
    channelMode?: ConversationChannelMode
  ) => Promise<ConversationSummary | null>;
  openGeneralConversation: (
    channelMode?: ConversationChannelMode
  ) => Promise<ConversationSummary | null>;
  sendMessage: (conversationId: string, text: string) => Promise<ActionResult & { messageRecord?: ChatMessage }>;
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

function getEmptyOperationalState(): Partial<AppState> {
  return {
    mapData: null,
    incidents: [],
    conversations: [],
    chatContacts: [],
    presenceByUser: {},
    messagesByConversation: {},
    documents: [],
    notifications: [],
    observability: null,
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
  cleanupSessionRuntime();
  setAuthToken(null);
  await persistSession(null, null);
  await clearTenantCache();
  set({
    ...getEmptyOperationalState(),
    token: null,
    refreshToken: null,
    authContext: null,
    user: null,
    error,
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
  return (Platform.OS === 'web' && typeof window !== 'undefined') ? window.localStorage : null;
}

async function withStorageTimeout<T>(task: Promise<T>, fallbackValue: T) {
  return await Promise.race([task, new Promise<T>((r) => setTimeout(() => r(fallbackValue), STORAGE_TIMEOUT_MS))]);
}

async function getStoredItem(key: string) {
  const web = getWebStorage();
  if (web) return web.getItem(key);
  try { return await withStorageTimeout(SecureStore.getItemAsync(key), null); } catch { return null; }
}

async function setStoredItem(key: string, value: string) {
  const web = getWebStorage();
  if (web) { web.setItem(key, value); return; }
  try { await withStorageTimeout(SecureStore.setItemAsync(key, value), undefined); } catch { }
}

async function deleteStoredItem(key: string) {
  const web = getWebStorage();
  if (web) { web.removeItem(key); return; }
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
    observability: state.observability,
    users: state.users,
    activeRouteSession: state.activeRouteSession,
    routeSessionHistory: state.routeSessionHistory,
  };
}

function stateFromCache(snapshot: OfflineCacheSnapshot | null): Partial<AppState> {
  if (!snapshot) {
    return {};
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
    observability: snapshot.observability || null,
    users: snapshot.users || [],
    activeRouteSession: snapshot.activeRouteSession || null,
    routeSessionHistory: snapshot.routeSessionHistory || [],
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
    const canAccessMobile = payload.canAccessMobile ?? payload.authContext.canAccessMobile;
    const mobileBlockReason: AuthRoutingContext['mobileBlockReason'] =
      payload.mobileBlockReason ??
      payload.authContext.mobileBlockReason ??
      (canAccessMobile === false ? 'sync_error' : null);

    return {
      ...payload.authContext,
      canAccessMobile,
      canUseOperations: canAccessMobile === true,
      destination: canAccessMobile === true
        ? 'HomeOperativo'
        : canAccessMobile === false
          ? 'PlanBlocked'
          : 'SyncError',
      mobileBlockReason,
      route: canAccessMobile === true
        ? '/mapa'
        : canAccessMobile === false
          ? '/plan-blocked'
          : '/sync-error',
    };
  }

  if (typeof payload.canAccessMobile === 'boolean') {
    const canAccessMobile = payload.canAccessMobile === true;
    const mobileBlockReason: AuthRoutingContext['mobileBlockReason'] =
      payload.mobileBlockReason ?? (canAccessMobile ? null : 'sync_error');

    return {
      canAccessMobile,
      canUseOperations: canAccessMobile,
      destination: canAccessMobile ? 'HomeOperativo' : 'PlanBlocked',
      mobileBlockReason,
      onboarding: payload.onboarding || null,
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
  if (!user) {
    return false;
  }

  if (authContext) {
    return authContext.canAccessMobile === true;
  }

  return false;
}

async function refreshAuthSession(set: StoreSet) {
  const session = await getSessionRequest();
  const authContext = getAuthContextFromPayload(session);

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
  token: string,
  refreshToken: string | null | undefined,
  rememberSession: boolean
) {
  await clearTenantCache();
  setAuthToken(token);

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
  try {
    await configureAppNotifications();
    const pushToken = await requestNativePushToken();

    if (!pushToken) {
      return;
    }

    const previousPushToken = await getStoredItem(PUSH_TOKEN_KEY);

    if (previousPushToken !== pushToken) {
      if (previousPushToken) {
        await unregisterPushSubscriptionRequest(previousPushToken).catch(() => undefined);
      }

      await setStoredItem(PUSH_TOKEN_KEY, pushToken);
    }

    await registerPushSubscriptionRequest({
      token: pushToken,
      platform: Platform.OS,
      deviceName: Platform.OS,
    });
  } catch (error) {
    logStoreError('pushToken', error);
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
  if (!socket?.connected || !current.user) return;
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

function connectSocket(set: StoreSet, get: () => AppState) {
  const { token, user } = get();
  if (!user) return disconnectSocket();
  const nextSessionKey = `${SOCKET_URL}:${user.id}:${token || 'anonymous'}`;

  if (socket && socketSessionKey === nextSessionKey) {
    if (!socket.connected) {
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

  const emitHeartbeat = () => {
    const current = get();
    if (!socket?.connected || !current.user) {
      return;
    }

    const packetId = createRealtimePacketId('heartbeat');
    const sentAt = Date.now();

    socket.timeout(SOCKET_ACK_TIMEOUT_MS).emit(
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
            networkStatus: socket?.connected ? 'online' : 'recovering',
            socketStatus:
              socket?.connected && missedHeartbeatAcks < SOCKET_MISSED_HEARTBEAT_LIMIT
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
            socket?.disconnect();
            socket?.connect();
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

  socket.on('connect', () => {
    missedHeartbeatAcks = 0;
    setSocketTransition(set, 'connected', 'socket_connected', {
      missedHeartbeatAcks: 0,
    });
    set({ networkStatus: 'online' });
    mobileLog('socket', `connected ${socket?.id || ''}`);
    emitCurrentPresence(get);
    emitHeartbeat();
    joinCurrentConversationRooms(get);
  });

  socket.io.on('reconnect_attempt', () => {
    socketReconnectAttempts += 1;
    setSocketTransition(set, 'reconnecting', 'socket_reconnect_attempt', {
      reconnectAttempts: socketReconnectAttempts,
    });
    set({ networkStatus: 'recovering' });
  });

  socket.io.on('reconnect', () => {
    missedHeartbeatAcks = 0;
    setSocketTransition(set, 'connected', 'socket_reconnected', {
      missedHeartbeatAcks: 0,
      reconnectAttempts: socketReconnectAttempts,
    });
    set({ networkStatus: 'online' });
    joinCurrentConversationRooms(get);
    get().flushPendingSync();
  });

  socket.on('disconnect', (reason) => {
    set((state) => applyPresenceToLoadedEntities(state, markAllPresenceUnknown()));
    setSocketTransition(set, reason === 'io client disconnect' ? 'disconnected' : 'reconnecting',
      `socket_disconnect:${reason}`);
    mobileLog('socket', `disconnected: ${reason}`);
  });

  socket.on('connect_error', (error) => {
    setSocketTransition(set, 'error', `socket_connect_error:${error.message}`);
    mobileLog('socket', 'connect_error', error.message);
  });

  const handleIncomingConversationMessage = async (
    payload: ChatMessage | { message?: ChatMessage; conversationId?: string }
  ) => {
    const m = 'message' in payload && payload.message ? payload.message : payload as ChatMessage;

    if (!m.conversationId) {
      return;
    }
    const hydrated = await hydrateConversationMessage(m, get().conversations.find(c => c.id === m.conversationId) || null, get().user);
    const conversationId = hydrated.conversationId!;
    const isOwnMessageBefore = hydrated.senderId === get().user?.id;
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
      socket?.emit('chat:delivered', {
        conversationId,
        messageId: hydrated.id,
      });
    }

    if (insertedMessage && !isOwnMessageBefore && !isRadio) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }

    if (insertedMessage && !isOwnMessageBefore && NativeAppState.currentState !== 'active') {
      showInAppNotification({
        title: isRadio ? 'Audio de radio recibido' : 'Mensaje nuevo',
        body: hydrated.sender?.name || 'ManeComb operativo',
        category: isRadio ? 'radio' : 'chat',
        data: {
          category: isRadio ? 'radio' : 'chat',
          conversationId,
        },
      }).catch(() => undefined);
    }
  };

  socket.on('chat:message', (payload) => {
    handleIncomingConversationMessage(payload).catch(() => undefined);
  });
  socket.on('radio:message:new', (payload) => {
    handleIncomingConversationMessage(payload).catch(() => undefined);
  });

  socket.on('chat:typing', ({ conversationId, userId, userName }: { conversationId: string; userId: string; userName: string }) => {
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

  socket.on('chat:typing:stop', ({ conversationId, userId }: { conversationId: string; userId: string }) => {
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

  socket.on('chat:delivered', ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
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

  socket.on('chat:read', ({ conversationId, messageId, userId: _userId }: { conversationId: string; messageId: string; userId: string }) => {
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

  socket.on('presence:snapshot', ({ userIds }: { userIds: string[] }) => {
    set(state => applyPresenceToLoadedEntities(
      state,
      buildPresenceSnapshot(getKnownPresenceUserIds(state), userIds || [])
    ));
  });

  socket.on('presence:updated', ({ userId, status }: { userId: string; status: 'online' | 'offline' }) => {
    set(state => applyPresenceToLoadedEntities(state, {
      ...state.presenceByUser,
      [userId]: status,
    }));
  });

  socket.on('location:updated', (v: Vehicle) => {
    const nextVehicle = normalizeVehicle(v);
    set(s => ({
      mapData: s.mapData
        ? {
            ...s.mapData,
            vehicles: s.mapData.vehicles.some(ev => ev.id === nextVehicle.id)
              ? s.mapData.vehicles.map(ev =>
                  ev.id === nextVehicle.id ? normalizeVehicle({ ...ev, ...nextVehicle }) : ev
                )
              : [...s.mapData.vehicles, nextVehicle],
            updatedAt: new Date().toISOString(),
          }
        : s.mapData,
    }));
  });

  socket.on('vehicle:created', (payload: unknown) => {
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

  socket.on('vehicle:updated', (payload: unknown) => {
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

  socket.on('user:deleted', (payload: unknown) => {
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

  socket.on('route-session:updated', (session: RouteSession) => {
    set({ activeRouteSession: ['RUNNING', 'PAUSED'].includes(session.status) ? session : null });
    persistOfflineSnapshot(get);
  });

  socket.on('user:updated', (payload: { user?: User }) => {
    if (payload.user?.id === get().user?.id) set({ user: payload.user });
    get().refreshAll().catch(() => undefined);
  });

  socket.on('incident:created', (i: Incident) => set(s => {
    const incident = enrichIncidentFromState(s, i);
    return {
      incidents: upsertIncident(s.incidents, incident),
      mapData: applyIncidentToMapData(s.mapData, incident),
    };
  }));
  socket.on('incident:updated', (i: Incident) => set(s => {
    const incident = enrichIncidentFromState(s, i);
    return {
      incidents: upsertIncident(s.incidents, incident),
      mapData: applyIncidentToMapData(s.mapData, incident),
    };
  }));

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
    socket?.on(eventName, (_payload) => {
      if (eventName === 'users:invited' || eventName === 'user:first-login') {
        get().loadUsers();
      }
      if (eventName === 'payment:confirmed' || eventName === 'plan:active' || eventName === 'subscription:updated') {
        refreshAuthSession(set)
          .then(() => get().refreshAll())
          .catch((error) => logStoreError(`socket:${eventName}:session`, error));
      }
    });
  });

  socketHeartbeatTimer = setInterval(() => {
    emitCurrentPresence(get);
    emitHeartbeat();
  }, SOCKET_HEARTBEAT_MS);

  socket.connect();
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

function configureMobileRuntime(set: StoreSet, get: () => AppState) {
  if (!recoveryConfigured) {
    configureApiSessionRecovery({
      getRefreshToken: async () => get().refreshToken || getStoredItem(REFRESH_TOKEN_KEY),
      onTokenRefresh: async (result) => {
        const nextRefreshToken = result.refreshToken || get().refreshToken;
        const authContext = getAuthContextFromPayload(result);
        setAuthToken(result.token);
        await persistSession(result.token, get().connectionMode, nextRefreshToken);
        set({
          authContext,
          token: result.token,
          refreshToken: nextRefreshToken || null,
          user: result.user || get().user,
        });

        if (socket) {
          socket.auth = result.token ? { token: result.token } : {};
          socket.disconnect().connect();
        }
      },
      onSessionExpired: async () => {
        await clearSessionState(set, 'Sesion expirada. Inicia sesion nuevamente.');
      },
      onNetworkSignal: (signal) => setNetworkSignal(set, signal),
    });
    recoveryConfigured = true;
  }

  if (!networkUnsubscribe) {
    networkUnsubscribe = subscribeMobileNetwork((snapshot) => {
      const reachable = isNetworkReachable(snapshot);
      setNetworkSignal(set, reachable ? 'online' : 'offline', snapshot);

      if (reachable && get().user) {
        connectSocket(set, get);
        get().flushPendingSync();
      }
    });
  }

  if (!appStateSubscription) {
    appStateSubscription = NativeAppState.addEventListener('change', (state) => {
      if (state === 'active' && get().user) {
        set((current) => applyPresenceToLoadedEntities(current, markAllPresenceUnknown()));
        getMobileNetworkSnapshot()
          .then((snapshot) => {
            set({
              networkSnapshot: snapshot,
              networkStatus: isNetworkReachable(snapshot) ? 'online' : 'offline',
            });
          })
          .catch(() => undefined);
        get().flushPendingSync();
        connectSocket(set, get);
      } else if (state !== 'active') {
        set((current) => applyPresenceToLoadedEntities(current, markAllPresenceUnknown()));
      }
    });
  }

  if (!apiHealthcheckTimer) {
    apiHealthcheckTimer = setInterval(() => {
      if (!get().user || get().networkStatus === 'offline') {
        return;
      }

      healthRequest()
        .then(() => set({ networkStatus: 'online' }))
        .catch((error) => {
          if (isProbablyNetworkError(error)) {
            setNetworkSignal(set, 'offline');
          }
        });
    }, API_HEALTHCHECK_MS);
  }
}

async function processPendingSyncQueue(set: StoreSet, get: () => AppState) {
  if (pendingSyncInFlight || !get().token || !get().user || get().networkStatus === 'offline') {
    return;
  }

  pendingSyncInFlight = true;

  try {
    const queue = await refreshPendingSyncCount(set);

    if (!queue.length) {
      return;
    }

    for (const operation of queue) {
      try {
        if (operation.type === 'control:sessionStart') {
          const session = await startRouteSessionRequest(operation.payload.vehicleId);
          set({ activeRouteSession: session });
        } else if (operation.type === 'control:sessionStatus') {
          const sessionId = operation.payload.sessionId ||
            (await getActiveRouteSessionRequest(operation.payload.vehicleId))?.id;
          if (!sessionId) throw new Error('No existe una jornada activa para sincronizar');
          const session = await updateRouteSessionStatusRequest(
            sessionId,
            operation.payload.vehicleId,
            operation.payload.status
          );
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
          if (!state.user) throw new Error('No hay una sesion activa para sincronizar el mensaje');
          await sendMessageRequest(
            operation.payload.conversationId,
            await buildTextMessagePayload({
              conversation: state.conversations.find(
                (entry) => entry.id === operation.payload.conversationId
              ) || null,
              user: state.user,
              text: operation.payload.text,
            })
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

        await removePendingSyncOperation(operation.id);
      } catch (error) {
        const nextOperation: PendingSyncOperation = {
          ...operation,
          attempts: operation.attempts + 1,
        };
        await replacePendingSyncOperation(nextOperation);

        if (isProbablyNetworkError(error)) {
          set({ networkStatus: 'offline' });
          break;
        }

        logStoreError(`pendingSync:${operation.type}`, error);
      }
    }

    await refreshPendingSyncCount(set);
    await get().refreshAll();
  } finally {
    pendingSyncInFlight = false;
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  apiUrl: API_URL, token: null, refreshToken: null, connectionMode: 'online', networkStatus: 'unknown', socketStatus: 'idle', realtimeDiagnostics: { heartbeatLatencyMs: null, lastPingAt: null, lastPongAt: null, lastSocketTransitionAt: null, missedHeartbeatAcks: 0, reconnectAttempts: 0, reason: null }, networkSnapshot: null, pendingSyncCount: 0, lastSyncedAt: null, lastCacheAt: null, themeMode: 'light', isHydrated: false, isBootstrapping: true, isRefreshing: false, isSubmitting: false,
  authContext: null, user: null, mapData: null, incidents: [], conversations: [], chatContacts: [], presenceByUser: {}, messagesByConversation: {}, documents: [], notifications: [], observability: null, users: [], activeRouteSession: null, routeSessionHistory: [],
  deviceLocation: { loading: true, permission: 'undetermined', backgroundPermission: 'undetermined', coordinates: null, lastUpdatedAt: null, servicesEnabled: true, issue: null, retryCount: 0 },
  refreshDeviceLocation: async () => undefined,
  syncBackgroundLocationCredentials: async (token, refreshToken) => {
    if (!token || !refreshToken) return;
    setAuthToken(token);
    await persistSession(token, get().connectionMode, refreshToken);
    set({ token, refreshToken });
  },
  activeConversationId: null, focusedIncidentId: null, typingByConversation: {}, readByConversation: {}, isLoadingConversation: false, isLoadingChatContacts: false, error: null,
  clearError: () => set({ error: null }),
  setActiveConversationId: (id) => {
    if (get().activeConversationId === id) return;
    set({ activeConversationId: id });
    socket?.emit('conversation:join', id);
  },
  setFocusedIncidentId: (id) => set({ focusedIncidentId: id }),
  markAsRead: (conversationId, messageId) => {
    const s = get();
    const existing = s.readByConversation[conversationId] || new Set();
    if (existing.has(messageId)) return;
    socket?.emit('chat:read', { conversationId, messageId }, (ack: { ok?: boolean } = {}) => {
      if (!ack.ok) return;
      set(current => ({
        conversations: current.conversations.map(conversation =>
          conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation
        ),
      }));
    });
  },
  emitTyping: (conversationId, isTyping) => {
    const s = get();
    if (isTyping) {
      socket?.emit('chat:typing', { conversationId, userId: s.user?.id, userName: s.user?.name });
    } else {
      socket?.emit('chat:typing:stop', { conversationId, userId: s.user?.id });
    }
  },
  initialize: async () => {
    configureMobileRuntime(set, get);
    set({ isBootstrapping: true });
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
      });
      if (!t) {
        await clearTenantCache();
        set({
          ...getEmptyOperationalState(),
          connectionMode,
          token: null,
          refreshToken: null,
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
        s = await getSessionRequest();
      } catch (error) {
        if (isProbablyNetworkError(error) && cached?.user) {
          set({
            ...getEmptyOperationalState(),
            connectionMode,
            token: sessionToken,
            refreshToken: nextRefreshToken,
            themeMode: th === 'dark' ? 'dark' : 'light',
            user: cached.user,
            authContext: null,
            lastCacheAt: cached.savedAt,
            isHydrated: true,
            isBootstrapping: false,
            networkStatus: 'recovering',
            error: 'No pudimos sincronizar tu cuenta. Reintenta cuando el servidor responda.',
          });
          return;
        }
        if (!rt) throw error;
        const refreshed = await refreshSessionRequest(rt);
        sessionToken = refreshed.token;
        nextRefreshToken = refreshed.refreshToken || rt;
        setAuthToken(sessionToken);
        await persistSession(sessionToken, connectionMode, nextRefreshToken);
        s = await getSessionRequest();
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
      set({ authContext, connectionMode, token: sessionToken, refreshToken: nextRefreshToken, themeMode: th === 'dark' ? 'dark' : 'light', user: s.profile.user, documents: s.profile.documents, isHydrated: true, isBootstrapping: false, networkStatus: 'online', error: null });
      registerCurrentPushToken();
      persistOfflineSnapshot(get);
      connectSocket(set, get);
      if (shouldRefreshOperationalData(authContext, s.profile.user)) {
        get().refreshAll();
      }
    } catch (error) {
      logStoreError('initialize', error);
      await clearSessionState(set, 'Sesion expirada.');
      set({ isHydrated: true, isBootstrapping: false });
    }
  },
  signIn: async (e, p, r = true) => {
    set({ isSubmitting: true, error: null });
    try {
      const res = await loginRequest(e, p);
      const { authContext, session } = await replaceSessionFromBackend(
        set,
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
        await get().refreshAll();
      }
      registerCurrentPushToken();
      persistOfflineSnapshot(get);
      connectSocket(set, get);
      return { ok: true };
    } catch (err) { const msg = getReadableErrorMessage(err, 'Error al iniciar sesion.', get().networkSnapshot); logStoreError('signIn', err); set({ error: msg }); return { ok: false, message: msg }; }
    finally { set({ isSubmitting: false }); }
  },
  signOut: async () => {
    disconnectSocket();
    await stopBackgroundLocationServiceAsync().catch(() => undefined);
    const rt = get().refreshToken || await getStoredItem(REFRESH_TOKEN_KEY);
    await logoutRequest(rt).catch(() => {});
    const pt = await getStoredItem(PUSH_TOKEN_KEY);
    if (pt) { await unregisterPushSubscriptionRequest(pt).catch(() => {}); await deleteStoredItem(PUSH_TOKEN_KEY); }
    await clearSessionState(set);
  },
  setThemeMode: async (m) => { await setStoredItem(THEME_KEY, m); set({ themeMode: m }); },
  refreshAll: async () => {
    const { authContext, token, user } = get();
    if (!token || !user) return;
    if (!shouldRefreshOperationalData(authContext, user)) {
      set({ isRefreshing: false });
      return;
    }
    set({ isRefreshing: true });
    try {
      const curr = get();
      const res = await Promise.allSettled([
        getLocationsRequest(), getIncidentsRequest(), getConversationsRequest(), getChatContactsRequest(),
        getDocumentsRequest(), getNotificationsRequest(), user.role === 'admin' ? getOperationalObservabilityRequest() : Promise.resolve(null),
        user.role === 'admin' || user.role === 'supervisor' || user.accountType === 'company_owner' ? getUsersRequest() : Promise.resolve([]),
        user.vehicleId ? getActiveRouteSessionRequest(user.vehicleId) : Promise.resolve(null),
        getRouteSessionHistoryRequest({ limit: 500 })
      ]);
      const data: any = {};
      const keys = ['mapData', 'incidents', 'conversations', 'chatContacts', 'documents', 'notifications', 'observability', 'users', 'activeRouteSession', 'routeSessionHistory'];
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

      if (res.some((result) => result.status === 'rejected' && isPlanRequiredError(result.reason))) {
        await clearOfflineCache().catch(() => undefined);
        let nextAuthContext: AuthRoutingContext | null = null;

        try {
          nextAuthContext = (await refreshAuthSession(set)).authContext;
        } catch (error) {
          logStoreError('refreshAll:planRequiredSession', error);
        }

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
          const ms = await getMessagesRequest(aid);
          const hms = await hydrateMessages(ms, data.conversations || curr.conversations, get().user, aid);
          data.messagesByConversation = { ...curr.messagesByConversation, [aid]: hms };
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
      set({ ...data, isRefreshing: false, isHydrated: true, isBootstrapping: false, networkStatus: 'online', error: null });
      persistOfflineSnapshot(get);
      connectSocket(set, get);
    } catch (error) {
      logStoreError('refreshAll', error);
      if (isProbablyNetworkError(error)) {
        const cached = await loadOfflineCache().catch(() => null);
        set({ ...stateFromCache(cached), isRefreshing: false, networkStatus: 'offline' });
        return;
      }
      set({ isRefreshing: false });
    }
  },
  flushPendingSync: async () => {
    await processPendingSyncQueue(set, get);
  },
  sendVehicleLocation: async (payload) => {
    const durablePayload = {
      ...payload,
      packetId: payload.packetId || createRealtimePacketId('gps'),
      sessionId: payload.sessionId || get().activeRouteSession?.id || null,
    };
    try {
      const vehicle = normalizeVehicle(await updateVehicleLocationRequest(durablePayload));
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
      return { ok: true };
    } catch (error) {
      if (isProbablyNetworkError(error)) {
        await enqueuePendingSyncOperation({
          type: 'vehicle:location',
          payload: durablePayload,
        });
        await refreshPendingSyncCount(set);
        set({ networkStatus: 'offline' });
        return { ok: true, message: 'Ubicacion guardada para sincronizar.' };
      }

      logStoreError('sendVehicleLocation', error);
      return {
        ok: false,
        message: getReadableErrorMessage(error, 'No fue posible actualizar la ubicacion.'),
      };
    }
  },
  sendMessage: async (cid, t) => {
    const { user } = get();
    if (!t.trim() || !user) {
      return { ok: false, message: 'El mensaje no puede ir vacio.' };
    }
    set({ isSubmitting: true });
    try {
      const conversation = get().conversations.find(e => e.id === cid) || null;
      const m = await sendMessageRequest(
        cid,
        await buildTextMessagePayload({ conversation, user, text: t })
      );
      const h = await hydrateConversationMessage(m, conversation, user);
      set(s => ({
        messagesByConversation: upsertConversationMessage(s.messagesByConversation, cid, h),
        conversations: sortConversations(s.conversations.map(c => c.id === cid ? { ...c, lastMessage: h } : c))
      }));
      return { ok: true, messageRecord: h };
    } catch (error) {
      logStoreError('sendMessage', error);
      if (isProbablyNetworkError(error)) {
        await enqueuePendingSyncOperation({
          type: 'chat:sendMessage',
          payload: {
            conversationId: cid,
            text: t.trim(),
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
    } finally { set({ isSubmitting: false }); }
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
    if (!currentUser || !['owner', 'admin', 'supervisor'].includes(currentUser.role)) return;

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
    set({ isLoadingConversation: true });
    try {
      const ms = await getMessagesRequest(id);
      const hms = await hydrateMessages(ms, get().conversations, get().user, id);
      set(s => ({
        messagesByConversation: {
          ...s.messagesByConversation,
          [id]: mergeConversationMessages(s.messagesByConversation[id] || [], hms),
        },
      }));
      socket?.emit('conversation:join', id);
    } catch (error) { logStoreError('loadConversation', error); }
    finally { set({ isLoadingConversation: false }); }
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
    try {
      const responseConversation = await openDirectConversationRequest(tid, m);
      const c = {
        ...responseConversation,
        participants: responseConversation.participants.map(participant => ({
          ...participant,
          status: get().presenceByUser[participant.id] || 'offline',
        })),
      };
      const [ms, cc] = await Promise.all([getMessagesRequest(c.id), getChatContactsRequest()]);
      const ncs = upsertConversation(get().conversations, c);
      const hms = await hydrateMessages(ms, ncs, get().user, c.id);
      set(s => ({ conversations: ncs, chatContacts: cc.map(contact => ({ ...contact, status: s.presenceByUser[contact.id] || 'offline' })), activeConversationId: c.id, messagesByConversation: { ...s.messagesByConversation, [c.id]: mergeConversationMessages(s.messagesByConversation[c.id] || [], hms) } }));
      socket?.emit('conversation:join', c.id); return c;
    } catch (error) { logStoreError('openDirectConversation', error); return null; }
  },
  openGeneralConversation: async (m = 'chat') => {
    try {
      const responseConversation = await openGeneralConversationRequest(m);
      const c = {
        ...responseConversation,
        participants: responseConversation.participants.map(participant => ({
          ...participant,
          status: get().presenceByUser[participant.id] || 'offline',
        })),
      };
      const ms = await getMessagesRequest(c.id);
      const ncs = upsertConversation(get().conversations, c);
      const hms = await hydrateMessages(ms, ncs, get().user, c.id);
      set(s => ({ conversations: ncs, activeConversationId: c.id, messagesByConversation: { ...s.messagesByConversation, [c.id]: mergeConversationMessages(s.messagesByConversation[c.id] || [], hms) } }));
      socket?.emit('conversation:join', c.id); return c;
    } catch (error) { logStoreError('openGeneralConversation', error); return null; }
  },
  sendVoiceMessage: async (cid, f) => {
    const { user } = get();
    if (!user) {
      return { ok: false, message: 'Debes iniciar sesion para enviar notas de voz.' };
    }
    set({ isSubmitting: true });
    try {
      const m = await sendVoiceMessageRequest(cid, f);
      const h = await hydrateConversationMessage(m, get().conversations.find(e => e.id === cid) || null, user);
      set(s => ({ messagesByConversation: upsertConversationMessage(s.messagesByConversation, cid, h), conversations: sortConversations(s.conversations.map(c => c.id === cid ? { ...c, lastMessage: h } : c)) }));
      return { ok: true, messageRecord: h };
    } catch (error) {
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
    } finally { set({ isSubmitting: false }); }
  },
  sendMediaMessage: async (cid, f) => {
    const { user } = get();
    if (!user) {
      return { ok: false, message: 'Debes iniciar sesion para enviar archivos.' };
    }
    set({ isSubmitting: true });
    try {
      const m = await sendMediaMessageRequest(cid, f);
      const h = await hydrateConversationMessage(m, get().conversations.find(e => e.id === cid) || null, user);
      set(s => ({ messagesByConversation: upsertConversationMessage(s.messagesByConversation, cid, h), conversations: sortConversations(s.conversations.map(c => c.id === cid ? { ...c, lastMessage: h } : c)) }));
      return { ok: true, messageRecord: h };
    } catch (error) {
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
    } finally { set({ isSubmitting: false }); }
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
    if (!i) return;
    if (i.notificationId) await get().markNotificationRead(i.notificationId).catch(() => {});
    if (i.target === 'chat' || i.target === 'radio') {
      const m = i.target === 'radio' ? 'radio' : i.channelMode || 'chat';
      if (i.conversationId) {
        if (!get().conversations.some(c => c.id === i.conversationId)) await get().refreshAll().catch(() => {});
        set({ activeConversationId: i.conversationId }); await get().loadConversation(i.conversationId); return;
      }
      await get().openGeneralConversation(m); return;
    }
    if (i.target === 'sos' || i.target === 'incidents') { if (i.incidentId) set({ focusedIncidentId: i.incidentId }); await get().refreshAll().catch(() => {}); }
  },
}));
