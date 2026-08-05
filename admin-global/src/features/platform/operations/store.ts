import { create } from 'zustand';
import {
  platformAuditRequest,
  platformCommercialOrderRequest,
  platformCommercialOrdersRequest,
  platformSystemReadinessRequest,
} from './api';
import type {
  PlatformAuditEntry,
  PlatformCommercialOrder,
  PlatformSystemReadiness,
} from './types';
import type { PlatformPagination } from '../companies/types';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

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
    set({ commercialState: 'loading', commercialError: null });
    try {
      const result = await platformCommercialOrdersRequest(token, params);
      set({ commercialState: 'ready', orders: result.items, orderPagination: result.pagination });
    } catch (error) {
      set({ commercialState: 'error', commercialError: errorMessage(error, 'No fue posible cargar las órdenes') });
    }
  },

  loadOrder: async (token, orderId) => {
    if (!token || !orderId) return;
    set({ commercialState: 'loading', commercialError: null, selectedOrder: null });
    try {
      const selectedOrder = await platformCommercialOrderRequest(token, orderId);
      set({ commercialState: 'ready', selectedOrder });
    } catch (error) {
      set({ commercialState: 'error', commercialError: errorMessage(error, 'No fue posible cargar la orden') });
    }
  },

  loadReadiness: async (token) => {
    if (!token) return;
    set({ systemState: 'loading', systemError: null });
    try {
      const readiness = await platformSystemReadinessRequest(token);
      set({ systemState: 'ready', readiness });
    } catch (error) {
      set({ systemState: 'error', systemError: errorMessage(error, 'No fue posible cargar el sistema') });
    }
  },

  loadAudit: async (token, params = {}) => {
    if (!token) return;
    set({ auditState: 'loading', auditError: null });
    try {
      const result = await platformAuditRequest(token, params);
      set({
        auditState: 'ready',
        auditEntries: result.items,
        auditPagination: result.pagination,
        auditPersistent: result.persistent,
      });
    } catch (error) {
      set({ auditState: 'error', auditError: errorMessage(error, 'No fue posible cargar la auditoría') });
    }
  },

  reset: () => set({
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
  }),
}));
