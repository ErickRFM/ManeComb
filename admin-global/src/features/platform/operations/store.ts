import { create } from 'zustand';
import {
  platformAuditRequest,
  platformCommercialOrderRequest,
  platformCommercialOrdersRequest,
  platformDeviceVersionStatsRequest,
  platformSystemObservabilityRequest,
  platformSystemReadinessRequest,
} from './api';
import type {
  PlatformAuditEntry,
  PlatformCommercialOrder,
  PlatformSystemReadiness,
} from './types';
import type { PlatformPagination } from '../companies/types';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

let ordersRequestId = 0;
let orderDetailRequestId = 0;
let readinessRequestId = 0;
let auditRequestId = 0;

type OperationsStore = {
  commercialState: LoadState;
  commercialError: string | null;
  orders: PlatformCommercialOrder[];
  orderPagination: PlatformPagination | null;
  selectedOrder: PlatformCommercialOrder | null;
  systemState: LoadState;
  systemError: string | null;
  readiness: PlatformSystemReadiness | null;
  auditState: LoadState;
  auditError: string | null;
  auditEntries: PlatformAuditEntry[];
  auditPagination: PlatformPagination | null;
  auditPersistent: boolean;
  loadOrders: (token: string, params?: Record<string, string | number | null | undefined>) => Promise<void>;
  loadOrder: (token: string, orderId: string) => Promise<void>;
  loadReadiness: (token: string) => Promise<void>;
  loadAudit: (token: string, params?: Record<string, string | number | null | undefined>) => Promise<void>;
  reset: () => void;
};

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export const usePlatformOperationsStore = create<OperationsStore>((set) => ({
  commercialState: 'idle',
  commercialError: null,
  orders: [],
  orderPagination: null,
  selectedOrder: null,
  systemState: 'idle',
  systemError: null,
  readiness: null,
  auditState: 'idle',
  auditError: null,
  auditEntries: [],
  auditPagination: null,
  auditPersistent: false,

  loadOrders: async (token, params = {}) => {
    if (!token) return;
    const requestId = ++ordersRequestId;
    set({ commercialState: 'loading', commercialError: null });
    try {
      const result = await platformCommercialOrdersRequest(token, params);
      if (requestId !== ordersRequestId) return;
      set({ commercialState: 'ready', orders: result.items, orderPagination: result.pagination });
    } catch (error) {
      if (requestId !== ordersRequestId) return;
      set({ commercialState: 'error', commercialError: errorMessage(error, 'No fue posible cargar las órdenes') });
    }
  },

  loadOrder: async (token, orderId) => {
    if (!token || !orderId) return;
    const requestId = ++orderDetailRequestId;
    set({ commercialState: 'loading', commercialError: null, selectedOrder: null });
    try {
      const selectedOrder = await platformCommercialOrderRequest(token, orderId);
      if (requestId !== orderDetailRequestId) return;
      set({ commercialState: 'ready', selectedOrder });
    } catch (error) {
      if (requestId !== orderDetailRequestId) return;
      set({ commercialState: 'error', commercialError: errorMessage(error, 'No fue posible cargar la orden') });
    }
  },

  loadReadiness: async (token) => {
    if (!token) return;
    const requestId = ++readinessRequestId;
    set({ systemState: 'loading', systemError: null });
    try {
      const [readiness, observability, deviceStats] = await Promise.all([
        platformSystemReadinessRequest(token),
        platformSystemObservabilityRequest(token),
        platformDeviceVersionStatsRequest(token),
      ]);
      if (requestId !== readinessRequestId) return;

      const snapshot: PlatformSystemReadiness = {
        ...readiness,
        observability: {
          status: observability.apiErrors > 0 || observability.activeCriticalIncidents > 0 ? 'attention' : 'ok',
          windowHours: observability.windowHours,
          apiErrors: observability.apiErrors,
          slowRequests: observability.slowRequests,
          activeCriticalIncidents: observability.activeCriticalIncidents,
          recentRtcSessions: observability.rtc.recentSessions,
          averageRtcDurationSeconds: observability.rtc.averageDurationSeconds,
        },
        appVersions: {
          status: deviceStats.total > 0 ? 'ok' : 'unknown',
          total: deviceStats.total,
          mostUsedVersion: deviceStats.mostUsedVersion || 'Sin datos',
          lastPublication: deviceStats.lastPublication || 'Sin publicación',
        },
      };
      set({ systemState: 'ready', readiness: snapshot });
    } catch (error) {
      if (requestId !== readinessRequestId) return;
      set({ systemState: 'error', systemError: errorMessage(error, 'No fue posible cargar el sistema') });
    }
  },

  loadAudit: async (token, params = {}) => {
    if (!token) return;
    const requestId = ++auditRequestId;
    set({ auditState: 'loading', auditError: null });
    try {
      const result = await platformAuditRequest(token, params);
      if (requestId !== auditRequestId) return;
      set({
        auditState: 'ready',
        auditEntries: result.items,
        auditPagination: result.pagination,
        auditPersistent: result.persistent,
      });
    } catch (error) {
      if (requestId !== auditRequestId) return;
      set({ auditState: 'error', auditError: errorMessage(error, 'No fue posible cargar la auditoría') });
    }
  },

  reset: () => {
    ordersRequestId += 1;
    orderDetailRequestId += 1;
    readinessRequestId += 1;
    auditRequestId += 1;
    set({
      commercialState: 'idle',
      commercialError: null,
      orders: [],
      orderPagination: null,
      selectedOrder: null,
      systemState: 'idle',
      systemError: null,
      readiness: null,
      auditState: 'idle',
      auditError: null,
      auditEntries: [],
      auditPagination: null,
      auditPersistent: false,
    });
  },
}));
