import type { PlatformPagination } from '../companies/types';

export type PlatformCommercialOrder = {
  id: string;
  organizationId: string | null;
  organizationSlug: string | null;
  companyName: string;
  owner: { userId: string | null; name: string | null; email: string | null };
  plan: { id: string | null; name: string; units: number; price: number; radioIncluded: boolean } | null;
  pricing: { basePlanPrice: number; radioFeaturePrice: number; totalPrice: number; currency: 'MXN' };
  status: {
    order: string | null;
    account: string | null;
    payment: string | null;
    activation: string | null;
    onboarding: string | null;
    trial: string | null;
    financial: string | null;
    chargeback: string | null;
  };
  billing: {
    paymentMethod: string | null;
    paymentProvider: string | null;
    currentPeriodEnd: string | null;
    paidUntil: string | null;
    nextBillingAt: string | null;
    cancelAtPeriodEnd: boolean;
    refundableAmountMinor: number;
  };
  lifecycle: {
    activatedAt: string | null;
    onboardingCompletedAt: string | null;
    cancelledAt: string | null;
    refundedAt: string | null;
    chargebackAt: string | null;
  };
  createdAt: string | null;
  updatedAt: string | null;
};

export type ReadinessComponent = {
  status?: string;
  ready?: boolean;
  connected?: boolean;
  configured?: boolean;
  enabled?: boolean;
  provider?: string;
  mode?: string;
  environment?: string;
  persistence?: string;
  healthy?: boolean;
  issues?: string[];
  [key: string]: string | number | boolean | string[] | null | undefined;
};

export type PlatformOperationalEvent = {
  id: string | null;
  type: string | null;
  scope: string | null;
  level: string | null;
  status: string | null;
  route: string | null;
  method: string | null;
  durationMs: number;
  createdAt: string | null;
};

export type PlatformOperationalInsights = {
  windowHours: number;
  apiErrors: number;
  slowRequests: number;
  pushDelivered: number;
  pushFailed: number;
  checkoutEvents: number;
  activeCriticalIncidents: number;
  rtc: {
    recentSessions: number;
    completedSessions: number;
    averageDurationSeconds: number;
  };
  recentEvents: PlatformOperationalEvent[];
};

export type PlatformDeviceVersionStats = {
  total: number;
  versions: Record<string, number>;
  mostUsedVersion: string | null;
  lastPublication: string | null;
};

export type PlatformSystemReadiness = {
  generatedAt: string;
  status: string;
  database: ReadinessComponent;
  storage: ReadinessComponent;
  payments: ReadinessComponent;
  redis: ReadinessComponent;
  queues: ReadinessComponent;
  communication: ReadinessComponent;
  email: ReadinessComponent;
  whatsapp: ReadinessComponent;
  rtc: ReadinessComponent;
  transcription: ReadinessComponent;
  observability?: ReadinessComponent;
  appVersions?: ReadinessComponent;
};

export type PlatformAuditEntry = {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  organizationId: string | null;
  severity: string;
  result: string | null;
  platformRole: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
};

export type PlatformOperationList<T> = {
  items: T[];
  pagination: PlatformPagination;
  filters: Record<string, unknown>;
};
