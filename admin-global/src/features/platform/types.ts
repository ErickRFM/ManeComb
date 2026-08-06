import type { AdminUser } from '@/features/auth/types';

export type PlatformModuleKey =
  | 'users'
  | 'sessions'
  | 'companies'
  | 'commercial'
  | 'system'
  | 'audit'
  | 'actions';

export type PlatformModules = Record<PlatformModuleKey, boolean>;

export type PlatformCapabilities = {
  user: AdminUser;
  permissions: string[];
  modules: PlatformModules;
};

export type PlatformOverview = {
  generatedAt: string;
  companies: {
    total: number;
  };
  users: {
    total: number;
    byStatus: {
      active: number;
      pending: number;
      suspended: number;
    };
  };
  vehicles: {
    total: number;
    byStatus: {
      on_route: number;
      maintenance: number;
      idle: number;
    };
  };
  commercialOrders?: {
    total: number;
    byStatus: {
      pending: number;
      active: number;
      completed: number;
      cancelled: number;
    };
  };
};

export type PlatformLoadState = 'idle' | 'loading' | 'ready' | 'error';
