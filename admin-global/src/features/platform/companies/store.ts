import { create } from 'zustand';
import { platformCompaniesRequest, platformCompanyRequest, type CompanyListRequest } from './api';
import type { PlatformCompany, PlatformCompanyFilters, PlatformPagination } from './types';

type RequestState = 'idle' | 'loading' | 'ready' | 'error';

let listRequestId = 0;
let detailRequestId = 0;

type CompanyStore = {
  listState: RequestState;
  detailState: RequestState;
  listError: string | null;
  detailError: string | null;
  items: PlatformCompany[];
  pagination: PlatformPagination | null;
  filters: PlatformCompanyFilters | null;
  selected: PlatformCompany | null;
  lastRequest: CompanyListRequest;
  loadList: (token: string, request?: CompanyListRequest) => Promise<void>;
  loadDetail: (token: string, organizationId: string, force?: boolean) => Promise<void>;
  reset: () => void;
};

export const usePlatformCompanyStore = create<CompanyStore>((set, get) => ({
  listState: 'idle',
  detailState: 'idle',
  listError: null,
  detailError: null,
  items: [],
  pagination: null,
  filters: null,
  selected: null,
  lastRequest: { page: 1, limit: 20, sort: 'createdAt', order: 'desc' },

  loadList: async (token, request = {}) => {
    if (!token) return;
    const requestId = ++listRequestId;
    const nextRequest = { ...get().lastRequest, ...request };
    set({ listState: 'loading', listError: null, lastRequest: nextRequest });
    try {
      const result = await platformCompaniesRequest(token, nextRequest);
      if (requestId !== listRequestId) return;
      set({
        listState: 'ready',
        listError: null,
        items: result.items,
        pagination: result.pagination,
        filters: result.filters,
      });
    } catch (error) {
      if (requestId !== listRequestId) return;
      set({
        listState: 'error',
        listError: error instanceof Error ? error.message : 'No fue posible cargar las empresas',
      });
    }
  },

  loadDetail: async (token, organizationId, force = false) => {
    if (!token || !organizationId) return;
    const current = get();
    if (!force && current.detailState === 'ready' && current.selected?.organizationId === organizationId) return;
    const requestId = ++detailRequestId;
    set({ detailState: 'loading', detailError: null, selected: null });
    try {
      const selected = await platformCompanyRequest(token, organizationId);
      if (requestId !== detailRequestId) return;
      set({ detailState: 'ready', detailError: null, selected });
    } catch (error) {
      if (requestId !== detailRequestId) return;
      set({
        detailState: 'error',
        detailError: error instanceof Error ? error.message : 'No fue posible cargar la empresa',
      });
    }
  },

  reset: () => {
    listRequestId += 1;
    detailRequestId += 1;
    set({
      listState: 'idle',
      detailState: 'idle',
      listError: null,
      detailError: null,
      items: [],
      pagination: null,
      filters: null,
      selected: null,
      lastRequest: { page: 1, limit: 20, sort: 'createdAt', order: 'desc' },
    });
  },
}));
