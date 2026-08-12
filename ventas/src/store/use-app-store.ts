import { isAxiosError } from 'axios';
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import type { OperationalUnitSnapshot } from '@shared/operational-contract';
import { reconcileOperationalSnapshot, upsertOperationalUnit } from './operational-reconciliation';
import { usePortalStore } from '@/features/portal/store/use-portal-store';
import { hasPortalPermission } from '@/features/portal/utils/access';
import type {
  ProfileMutationPayload,
  RegisterPayload,
  RouteAssignmentPayload,
  User,
  UserMutationPayload,
  Vehicle,
  VehicleMutationPayload,
} from '@/src/types/app';
import {
  API_URL,
  SOCKET_URL,
  assignRouteRequest,
  clearRouteAssignmentRequest,
  configureApiSessionRecovery,
  createVehicleRequest,
  deleteUserRequest,
  deleteVehicleRequest,
  deleteDriverRequest,
  offboardDriverRequest,
  reactivateDriverRequest,
  retireVehicleRequest,
  getApiErrorMessage,
  getSessionRequest,
  forgotPasswordRequest,
  getUsersRequest,
  getVehiclesRequest,
  getOperationalUnitsRequest,
  loginRequest,
  logoutRequest,
  registerRequest,
  setAuthToken,
  updateProfileRequest,
  updateUserRequest,
  updateVehicleRequest,
} from '@/src/api/client';

const TOKEN_KEY = 'manecomb-ventas-token';
const REFRESH_TOKEN_KEY = 'manecomb-ventas-refresh-token';

type ActionResult = {
  ok: boolean;
  message?: string;
};

type SocketStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

type AppState = {
  apiUrl: string;
  token: string | null;
  refreshToken: string | null;
  socketStatus: SocketStatus;
  routeSessionVersion: number;
  lastRouteSessionUpdateId: string | null;
  isHydrated: boolean;
  isBootstrapping: boolean;
  isSubmitting: boolean;
  user: User | null;
  users: User[];
  vehicles: Vehicle[];
  operationalUnits: OperationalUnitSnapshot[];
  error: string | null;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string, rememberSession?: boolean) => Promise<ActionResult>;
  register: (payload: RegisterPayload, rememberSession?: boolean) => Promise<ActionResult>;
  forgotPassword: (email: string) => Promise<ActionResult>;
  signOut: () => Promise<void>;
  refreshAll: () => Promise<void>;
  loadUsers: () => Promise<void>;
  loadVehicles: (options?: { includeRetired?: boolean }) => Promise<void>;
  updateUser: (userId: string, payload: UserMutationPayload) => Promise<ActionResult>;
  deleteUser: (userId: string) => Promise<ActionResult>;
  offboardDriver: (userId: string, reason: string) => Promise<ActionResult>;
  reactivateDriver: (userId: string) => Promise<ActionResult>;
  deleteDriver: (userId: string, reason: string, confirmation: string) => Promise<ActionResult>;
  createVehicle: (payload: VehicleMutationPayload) => Promise<ActionResult>;
  updateVehicle: (vehicleId: string, payload: VehicleMutationPayload) => Promise<ActionResult>;
  deleteVehicle: (vehicleId: string) => Promise<ActionResult>;
  retireVehicle: (vehicleId: string, reason: string) => Promise<ActionResult>;
  assignRoute: (payload: RouteAssignmentPayload) => Promise<ActionResult>;
  clearRouteAssignment: (vehicleId: string) => Promise<ActionResult>;
  updateProfile: (payload: ProfileMutationPayload) => Promise<ActionResult>;
  clearError: () => void;
};

let socket: Socket | null = null;
let socketSessionKey: string | null = null;
type PortalRealtimeSocketSubscriber = (nextSocket: Socket | null) => void;
const portalRealtimeSocketSubscribers = new Set<PortalRealtimeSocketSubscriber>();

function publishPortalRealtimeSocket() {
  portalRealtimeSocketSubscribers.forEach((subscriber) => subscriber(socket));
}

/**
 * Comunicación, llamadas y operación consumen exactamente el mismo Socket.IO.
 * Ningún feature del Portal debe crear una segunda conexión autenticada.
 */
export function getSharedPortalRealtimeSocket(): Socket | null {
  return socket;
}

export function subscribeSharedPortalRealtimeSocket(
  subscriber: PortalRealtimeSocketSubscriber
): () => void {
  portalRealtimeSocketSubscribers.add(subscriber);
  subscriber(socket);
  return () => portalRealtimeSocketSubscribers.delete(subscriber);
}

function extractVehicleFromRealtimePayload(payload: unknown): Vehicle | null {
  const candidate = (payload && typeof payload === 'object' && 'vehicle' in payload ? (payload as { vehicle?: unknown }).vehicle : payload) as Vehicle | null;
  return candidate && typeof candidate === 'object' && typeof candidate.id === 'string' ? candidate : null;
}

function upsertRealtimeVehicle(vehicle: Vehicle) {
  useAppStore.setState((state) => {
    const exists = state.vehicles.some((entry) => entry.id === vehicle.id);
    return {
      vehicles: exists
        ? state.vehicles.map((entry) => (entry.id === vehicle.id ? { ...entry, ...vehicle } : entry))
        : [vehicle, ...state.vehicles],
    };
  });
}

function getStoredItem(key: string) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStoredItem(key: string, value: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked by browser privacy policies. The in-memory session
    // remains valid, but persistence must never block hydration or login.
  }
}

function deleteStoredItem(key: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Treat restricted storage as already cleared from this runtime's point of view.
  }
}

function persistSession(token: string | null, refreshToken?: string | null) {
  if (!token) {
    deleteStoredItem(TOKEN_KEY);
    deleteStoredItem(REFRESH_TOKEN_KEY);
    return;
  }

  setStoredItem(TOKEN_KEY, token);

  if (refreshToken) {
    setStoredItem(REFRESH_TOKEN_KEY, refreshToken);
  } else {
    deleteStoredItem(REFRESH_TOKEN_KEY);
  }
}

function clearPortalState() {
  usePortalStore.getState().reset();
}

async function hasActivePortalSubscription() {
  let portalState = usePortalStore.getState();
  const knownSubscription = portalState.subscription || portalState.overview?.subscription || null;

  if (knownSubscription) {
    return knownSubscription.isActive === true;
  }

  await portalState.loadOverview();
  portalState = usePortalStore.getState();
  return Boolean((portalState.subscription || portalState.overview?.subscription)?.isActive);
}

function normalizeLoginPayload(payload: any) {
  const user = payload?.user || payload?.profile?.user || null;

  return {
    token: payload?.token || null,
    refreshToken: payload?.refreshToken || null,
    user,
  };
}

function getReadableError(error: unknown, fallback: string) {
  if (isAxiosError(error)) {
    return getApiErrorMessage(error, fallback);
  }

  return error instanceof Error ? error.message : fallback;
}

function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.io.removeAllListeners();
    socket.disconnect();
    socket = null;
    publishPortalRealtimeSocket();
  }

  socketSessionKey = null;
  useAppStore.setState({ socketStatus: 'disconnected' });
}

function connectSocket(get: () => AppState) {
  const { token, user } = get();

  if (!token || !user) {
    disconnectSocket();
    return;
  }

  const nextSessionKey = `${SOCKET_URL}:${user.id}:${token}`;

  if (socket && socketSessionKey === nextSessionKey) {
    if (!socket.connected) {
      useAppStore.setState({ socketStatus: 'connecting' });
      socket.connect();
    }
    return;
  }

  disconnectSocket();
  socketSessionKey = nextSessionKey;
  useAppStore.setState({ socketStatus: 'connecting' });

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    timeout: 15000,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 900,
    reconnectionDelayMax: 10000,
    autoConnect: false,
  });
  publishPortalRealtimeSocket();

  socket.on('connect', () => {
    useAppStore.setState({ socketStatus: 'connected' });
    socket?.emit('presence:join', {
      userId: user.id,
      role: user.role,
      organizationId: user.organizationId,
      accountType: user.accountType,
    });
  });

  socket.io.on('reconnect_attempt', () => {
    useAppStore.setState({ socketStatus: 'reconnecting' });
  });

  socket.io.on('reconnect', () => {
    useAppStore.setState({ socketStatus: 'reconnecting' });
    void Promise.all([
      usePortalStore.getState().loadAll(),
      useAppStore.getState().loadVehicles(),
    ]).finally(() => useAppStore.setState({ socketStatus: 'connected' }));
  });

  socket.on('disconnect', () => {
    useAppStore.setState({ socketStatus: 'disconnected' });
  });

  socket.on('connect_error', () => {
    useAppStore.setState({ socketStatus: 'error' });
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
    'vehicle:created',
    'vehicle:updated',
    'vehicle:deleted',
    'location:updated',
    'operational-unit:updated',
    'route-session:updated',
    'user:updated',
    'user:deleted',
    'driver:offboarded',
    'driver:reactivated',
    'vehicle:released',
    'vehicle:retired',
    'activation:summary-updated',
  ].forEach((eventName) => {
    socket?.on(eventName, (payload) => {
      usePortalStore.getState().applyRealtimeEvent(eventName, payload);

      if (eventName === 'operational-unit:updated') {
        const unit = payload && typeof payload === 'object' && 'unit' in payload
          ? (payload as { unit?: OperationalUnitSnapshot }).unit
          : null;
        if (unit?.unitId) {
          useAppStore.setState((state) => ({
            operationalUnits: upsertOperationalUnit(state.operationalUnits, unit),
          }));
        }
      }

      if (eventName === 'users:invited' || eventName === 'user:first-login' || eventName === 'user:updated') {
        void useAppStore.getState().loadUsers();
        void useAppStore.getState().loadVehicles();
      }

      if (eventName === 'driver:offboarded' || eventName === 'driver:reactivated' || eventName === 'vehicle:released') {
        void useAppStore.getState().loadUsers();
        void useAppStore.getState().loadVehicles();
        void usePortalStore.getState().loadOverview();
      }

      if (eventName === 'user:deleted') {
        const userId = (payload as { userId?: string }).userId || (payload as { user?: { id: string } }).user?.id;
        if (userId) {
          useAppStore.setState((s) => ({
            users: s.users.filter((u) => u.id !== userId),
          }));
        }
        void useAppStore.getState().loadVehicles();
      }

      if (eventName === 'vehicle:created' || eventName === 'vehicle:updated' || eventName === 'location:updated') {
        const vehicle = extractVehicleFromRealtimePayload(payload);
        if (vehicle) {
          upsertRealtimeVehicle(vehicle);
        } else {
          void useAppStore.getState().loadVehicles();
        }
      }

      if (eventName === 'vehicle:retired') {
        const vehicle = extractVehicleFromRealtimePayload(payload);
        if (vehicle) upsertRealtimeVehicle(vehicle);
        else void useAppStore.getState().loadVehicles();
      }

      if (eventName === 'vehicle:deleted') {
        const vehicleId = (payload as { vehicleId?: string }).vehicleId;
        if (vehicleId) {
          useAppStore.setState((s) => ({
            vehicles: s.vehicles.filter((v) => v.id !== vehicleId),
          }));
        }
      }

      if (eventName === 'route-session:updated') {
        const sessionId = payload && typeof payload === 'object' && 'id' in payload ? String((payload as { id?: unknown }).id || '') : null;
        useAppStore.setState((state) => ({
          lastRouteSessionUpdateId: sessionId || null,
          routeSessionVersion: state.routeSessionVersion + 1,
        }));
      }
    });
  });

  socket.connect();
}

async function clearSession(set: (partial: Partial<AppState>) => void) {
  disconnectSocket();
  setAuthToken(null);
  persistSession(null);
  clearPortalState();
  set({
    token: null,
    refreshToken: null,
    user: null,
    users: [],
    vehicles: [],
    operationalUnits: [],
    lastRouteSessionUpdateId: null,
    routeSessionVersion: 0,
  });
}

export const useAppStore = create<AppState>((set, get) => ({
  apiUrl: API_URL,
  token: null,
  refreshToken: null,
  socketStatus: 'idle',
  lastRouteSessionUpdateId: null,
  routeSessionVersion: 0,
  isHydrated: false,
  isBootstrapping: true,
  isSubmitting: false,
  user: null,
  users: [],
  vehicles: [],
  operationalUnits: [],
  error: null,
  clearError: () => set({ error: null }),
  initialize: async () => {
    set({ isBootstrapping: true });

    const token = getStoredItem(TOKEN_KEY);
    const refreshToken = getStoredItem(REFRESH_TOKEN_KEY);

    if (!token) {
      await clearSession(set);
      set({ isBootstrapping: false, isHydrated: true });
      return;
    }

    try {
      setAuthToken(token);
      const session = await getSessionRequest();
      const user = session?.profile?.user || session?.user || null;

      set({
        token,
        refreshToken,
        user,
        isBootstrapping: false,
        isHydrated: true,
        error: null,
      });
      connectSocket(get);
      void get().refreshAll();
    } catch (error) {
      await clearSession(set);
      set({
        error: getReadableError(error, 'Sesion expirada.'),
        isBootstrapping: false,
        isHydrated: true,
      });
    }
  },
  signIn: async (email, password, rememberSession = true) => {
    if (get().isSubmitting) {
      return { ok: false, message: 'Hay una operacion en curso.' };
    }
    set({ isSubmitting: true, error: null });

    try {
      const response = normalizeLoginPayload(await loginRequest(email, password));

      if (!response.token || !response.user) {
        throw new Error('El backend no devolvio una sesion valida.');
      }

      clearPortalState();
      setAuthToken(response.token);
      persistSession(
        rememberSession ? response.token : null,
        rememberSession ? response.refreshToken : null
      );

      set({
        token: response.token,
        refreshToken: response.refreshToken,
        user: response.user,
        error: null,
      });
      connectSocket(get);
      void get().refreshAll();
      return { ok: true };
    } catch (error) {
      const message = getReadableError(error, 'Error al iniciar sesion.');
      set({ error: message });
      return { ok: false, message };
    } finally {
      set({ isSubmitting: false });
    }
  },
  register: async (payload, rememberSession = true) => {
    if (get().isSubmitting) {
      return { ok: false, message: 'Hay una operacion en curso.' };
    }
    set({ isSubmitting: true, error: null });

    try {
      const response = normalizeLoginPayload(await registerRequest(payload));

      if (!response.token || !response.user) {
        throw new Error('El backend no devolvio una sesion valida.');
      }

      clearPortalState();
      setAuthToken(response.token);
      persistSession(
        rememberSession ? response.token : null,
        rememberSession ? response.refreshToken : null
      );

      set({
        token: response.token,
        refreshToken: response.refreshToken,
        user: response.user,
        error: null,
      });
      connectSocket(get);
      void get().refreshAll();
      return { ok: true };
    } catch (error) {
      const message = getReadableError(error, 'Error al registrar.');
      set({ error: message });
      return { ok: false, message };
    } finally {
      set({ isSubmitting: false });
    }
  },
  forgotPassword: async (email) => {
    if (get().isSubmitting) {
      return { ok: false, message: 'Hay una operacion en curso.' };
    }
    set({ isSubmitting: true, error: null });
    try {
      const response = await forgotPasswordRequest(email);
      return { ok: true, message: response.message };
    } catch (error) {
      const message = getReadableError(error, 'No fue posible recuperar el acceso.');
      set({ error: message });
      return { ok: false, message };
    } finally {
      set({ isSubmitting: false });
    }
  },
  signOut: async () => {
    const refreshToken = get().refreshToken || getStoredItem(REFRESH_TOKEN_KEY);
    await logoutRequest(refreshToken).catch(() => undefined);
    await clearSession(set);
  },
  refreshAll: async () => {
    const { token, user } = get();

    if (!token || !user) {
      return;
    }

    const operationalAccess = await hasActivePortalSubscription();
    if (!operationalAccess) {
      set({ users: [], vehicles: [], operationalUnits: [], error: null });
      connectSocket(get);
      return;
    }

    if (hasPortalPermission(user, 'users')) {
      await get().loadUsers().catch(() => undefined);
    }
    if (hasPortalPermission(user, 'vehicles') || hasPortalPermission(user, 'routes')) {
      await get().loadVehicles().catch(() => undefined);
    }

    connectSocket(get);
  },
  loadUsers: async () => {
    const user = get().user;

    if (!hasPortalPermission(user, 'users')) {
      return;
    }

    if (!(await hasActivePortalSubscription())) {
      set({ users: [] });
      return;
    }

    try {
      const users = await getUsersRequest();
      set({ users, error: null });
    } catch (error) {
      set({ error: getReadableError(error, 'No fue posible cargar usuarios.') });
    }
  },
  loadVehicles: async (options = {}) => {
    const user = get().user;

    if (!hasPortalPermission(user, 'vehicles') && !hasPortalPermission(user, 'routes')) {
      return;
    }

    if (!(await hasActivePortalSubscription())) {
      set({ vehicles: [], operationalUnits: [] });
      return;
    }

    try {
      const [vehicles, operationalUnits] = await Promise.all([
        getVehiclesRequest(options),
        getOperationalUnitsRequest(),
      ]);
      set((state) => ({
        vehicles,
        operationalUnits: reconcileOperationalSnapshot(state.operationalUnits, operationalUnits),
        error: null,
      }));
    } catch (error) {
      set({ error: getReadableError(error, 'No fue posible cargar unidades.') });
    }
  },
  updateUser: async (userId, payload) => {
    if (!hasPortalPermission(get().user, 'users')) {
      return { ok: false, message: 'No tienes permiso para administrar usuarios.' };
    }
    if (get().isSubmitting) {
      return { ok: false, message: 'Hay una operacion en curso.' };
    }
    set({ isSubmitting: true, error: null });

    try {
      const user = await updateUserRequest(userId, payload);
      set((state) => ({
        users: state.users.map((entry) => (entry.id === userId ? user : entry)),
      }));
      if (typeof payload.vehicleId !== 'undefined') {
        void get().loadVehicles();
      }
      return { ok: true };
    } catch (error) {
      const message = getReadableError(error, 'No fue posible actualizar el usuario.');
      set({ error: message });
      return { ok: false, message };
    } finally {
      set({ isSubmitting: false });
    }
  },
  deleteUser: async (userId) => {
    if (!hasPortalPermission(get().user, 'users')) {
      return { ok: false, message: 'No tienes permiso para administrar usuarios.' };
    }
    if (get().isSubmitting) {
      return { ok: false, message: 'Hay una operacion en curso.' };
    }
    set({ isSubmitting: true, error: null });

    try {
      await deleteUserRequest(userId);
      set((state) => ({ users: state.users.filter((entry) => entry.id !== userId) }));
      return { ok: true };
    } catch (error) {
      const message = getReadableError(error, 'No fue posible eliminar el usuario.');
      set({ error: message });
      return { ok: false, message };
    } finally {
      set({ isSubmitting: false });
    }
  },
  offboardDriver: async (userId, reason) => {
    if (!hasPortalPermission(get().user, 'users')) return { ok: false, message: 'No tienes permiso para administrar conductores.' };
    if (get().isSubmitting) return { ok: false, message: 'Hay una operacion en curso.' };
    set({ isSubmitting: true, error: null });
    try {
      const result = await offboardDriverRequest(userId, reason);
      set((state) => ({
        users: state.users.map((entry) => (entry.id === userId ? result.user : entry)),
        vehicles: result.releasedVehicle
          ? state.vehicles.map((entry) => (entry.id === result.releasedVehicle.id ? result.releasedVehicle : entry))
          : state.vehicles,
      }));
      void usePortalStore.getState().loadOverview();
      return { ok: true, message: result.message };
    } catch (error) {
      const message = getReadableError(error, 'No fue posible dar de baja al conductor.');
      set({ error: message }); return { ok: false, message };
    } finally { set({ isSubmitting: false }); }
  },
  reactivateDriver: async (userId) => {
    if (!hasPortalPermission(get().user, 'users')) return { ok: false, message: 'No tienes permiso para administrar conductores.' };
    if (get().isSubmitting) return { ok: false, message: 'Hay una operacion en curso.' };
    set({ isSubmitting: true, error: null });
    try {
      const result = await reactivateDriverRequest(userId);
      set((state) => ({ users: state.users.map((entry) => (entry.id === userId ? result.user : entry)) }));
      void usePortalStore.getState().loadOverview();
      return { ok: true };
    } catch (error) {
      const message = getReadableError(error, 'No fue posible reactivar al conductor.');
      set({ error: message }); return { ok: false, message };
    } finally { set({ isSubmitting: false }); }
  },
  deleteDriver: async (userId, reason, confirmation) => {
    if (!hasPortalPermission(get().user, 'users')) return { ok: false, message: 'No tienes permiso para administrar conductores.' };
    if (get().isSubmitting) return { ok: false, message: 'Hay una operacion en curso.' };
    set({ isSubmitting: true, error: null });
    try {
      await deleteDriverRequest(userId, reason, confirmation);
      set((state) => ({ users: state.users.filter((entry) => entry.id !== userId) }));
      return { ok: true };
    } catch (error) {
      const message = getReadableError(error, 'No fue posible eliminar al conductor.');
      set({ error: message }); return { ok: false, message };
    } finally { set({ isSubmitting: false }); }
  },
  createVehicle: async (payload) => {
    if (!hasPortalPermission(get().user, 'vehicles')) {
      return { ok: false, message: 'No tienes permiso para administrar unidades.' };
    }
    if (get().isSubmitting) {
      return { ok: false, message: 'Hay una operacion en curso.' };
    }
    set({ isSubmitting: true, error: null });

    try {
      const vehicle = await createVehicleRequest(payload);
      set((state) => {
        const exists = state.vehicles.some((entry) => entry.id === vehicle.id);
        return {
          vehicles: exists
            ? state.vehicles.map((entry) => (entry.id === vehicle.id ? { ...entry, ...vehicle } : entry))
            : [vehicle, ...state.vehicles],
        };
      });
      return { ok: true };
    } catch (error) {
      const message = getReadableError(error, 'No fue posible crear la unidad.');
      set({ error: message });
      return { ok: false, message };
    } finally {
      set({ isSubmitting: false });
    }
  },
  updateVehicle: async (vehicleId, payload) => {
    if (!hasPortalPermission(get().user, 'vehicles')) {
      return { ok: false, message: 'No tienes permiso para administrar unidades.' };
    }
    if (get().isSubmitting) {
      return { ok: false, message: 'Hay una operacion en curso.' };
    }
    set({ isSubmitting: true, error: null });

    try {
      const vehicle = await updateVehicleRequest(vehicleId, payload);
      set((state) => ({
        vehicles: state.vehicles.map((entry) => (entry.id === vehicleId ? vehicle : entry)),
      }));
      return { ok: true };
    } catch (error) {
      const message = getReadableError(error, 'No fue posible actualizar la unidad.');
      set({ error: message });
      return { ok: false, message };
    } finally {
      set({ isSubmitting: false });
    }
  },
  deleteVehicle: async (vehicleId) => {
    if (!hasPortalPermission(get().user, 'vehicles')) {
      return { ok: false, message: 'No tienes permiso para administrar unidades.' };
    }
    if (get().isSubmitting) {
      return { ok: false, message: 'Hay una operacion en curso.' };
    }
    set({ isSubmitting: true, error: null });

    try {
      const result = await deleteVehicleRequest(vehicleId);
      set((state) => ({
        vehicles: state.vehicles.filter((entry) => entry.id !== vehicleId),
      }));
      return { ok: true };
    } catch (error) {
      const message = getReadableError(error, 'No fue posible eliminar la unidad.');
      set({ error: message });
      return { ok: false, message };
    } finally {
      set({ isSubmitting: false });
    }
  },
  retireVehicle: async (vehicleId, reason) => {
    if (!hasPortalPermission(get().user, 'vehicles')) return { ok: false, message: 'No tienes permiso para administrar unidades.' };
    if (get().isSubmitting) return { ok: false, message: 'Hay una operacion en curso.' };
    set({ isSubmitting: true, error: null });
    try {
      const result = await retireVehicleRequest(vehicleId, reason);
      set((state) => ({ vehicles: state.vehicles.map((entry) => (entry.id === vehicleId ? result.vehicle : entry)) }));
      return { ok: true };
    } catch (error) {
      const message = getReadableError(error, 'No fue posible retirar la unidad.');
      set({ error: message }); return { ok: false, message };
    } finally { set({ isSubmitting: false }); }
  },
  assignRoute: async (payload) => {
    if (!hasPortalPermission(get().user, 'routes')) {
      return { ok: false, message: 'No tienes permiso para administrar rutas.' };
    }
    if (get().isSubmitting) {
      return { ok: false, message: 'Hay una operacion en curso.' };
    }
    set({ isSubmitting: true, error: null });

    try {
      const vehicle = await assignRouteRequest(payload);
      set((state) => ({
        vehicles: state.vehicles.map((entry) => (entry.id === vehicle.id ? vehicle : entry)),
      }));
      return { ok: true };
    } catch (error) {
      const message = getReadableError(error, 'No fue posible asignar la ruta.');
      set({ error: message });
      return { ok: false, message };
    } finally {
      set({ isSubmitting: false });
    }
  },
  clearRouteAssignment: async (vehicleId) => {
    if (!hasPortalPermission(get().user, 'routes')) {
      return { ok: false, message: 'No tienes permiso para administrar rutas.' };
    }
    if (get().isSubmitting) {
      return { ok: false, message: 'Hay una operacion en curso.' };
    }
    set({ isSubmitting: true, error: null });

    try {
      const vehicle = await clearRouteAssignmentRequest(vehicleId);
      set((state) => ({
        vehicles: state.vehicles.map((entry) => (entry.id === vehicle.id ? vehicle : entry)),
      }));
      return { ok: true };
    } catch (error) {
      const message = getReadableError(error, 'No fue posible liberar la ruta.');
      set({ error: message });
      return { ok: false, message };
    } finally {
      set({ isSubmitting: false });
    }
  },
  updateProfile: async (payload) => {
    if (get().isSubmitting) {
      return { ok: false, message: 'Hay una operacion en curso.' };
    }
    set({ isSubmitting: true, error: null });

    try {
      const user = await updateProfileRequest(payload);
      set((state) => ({
        user,
        users: state.users.map((entry) => (entry.id === user.id ? user : entry)),
      }));
      return { ok: true };
    } catch (error) {
      const message = getReadableError(error, 'No fue posible actualizar el perfil.');
      set({ error: message });
      return { ok: false, message };
    } finally {
      set({ isSubmitting: false });
    }
  },
}));

configureApiSessionRecovery({
  getRefreshToken: () => useAppStore.getState().refreshToken || getStoredItem(REFRESH_TOKEN_KEY),
  onTokenRefresh: (session) => {
    const shouldPersist = Boolean(getStoredItem(REFRESH_TOKEN_KEY));
    if (shouldPersist) {
      persistSession(session.token, session.refreshToken);
    }
    useAppStore.setState((state) => ({
      token: session.token,
      refreshToken: session.refreshToken || state.refreshToken,
      user: (session.user as User | undefined) || state.user,
    }));
  },
  onSessionExpired: () => clearSession(useAppStore.setState),
});