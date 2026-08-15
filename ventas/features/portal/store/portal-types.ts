import type {
  DocumentItem,
  Incident,
  PortalActivationKey,
  PortalActivationKeysSummary,
  PortalAppInfo,
  PortalAppVersion,
  PortalInvoice,
  PortalOnboarding,
  PortalOverview,
  PortalSession,
  PortalSubscription,
} from '../types';
import type { ResourceState } from '@shared/resource-state';

export type PortalResourceDomain =
  | 'account'
  | 'billing'
  | 'sessions'
  | 'documents'
  | 'incidents'
  | 'appInfo'
  | 'operational';

export type PortalActionResult = {
  ok: boolean;
  message?: string;
};

export type PortalLoadOptions = {
  force?: boolean;
  includeBilling?: boolean;
};

export type PortalStore = {
  overview: PortalOverview | null;
  onboarding: PortalOnboarding | null;
  subscription: PortalSubscription | null;
  activationKeys: PortalActivationKey[];
  activationSummary: PortalActivationKeysSummary | null;
  invoices: PortalInvoice[];
  sessions: PortalSession[];
  documents: DocumentItem[];
  incidents: Incident[];
  appInfo: PortalAppInfo | null;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  resources: Record<PortalResourceDomain, ResourceState>;
  loadOverview: () => Promise<void>;
  loadAppInfo: () => Promise<void>;
  updateAppInfo: (payload: Partial<PortalAppInfo> & { versionHistory?: PortalAppVersion[] }) => Promise<PortalActionResult>;
  loadActivationKeys: () => Promise<void>;
  loadBilling: () => Promise<void>;
  loadSessions: () => Promise<void>;
  loadDocuments: () => Promise<void>;
  loadIncidents: () => Promise<void>;
  loadAll: (options?: PortalLoadOptions) => Promise<void>;
  generateActivationKey: () => Promise<PortalActionResult>;
  shareActivationKey: (activationKeyId: string) => Promise<PortalActionResult>;
  revokeActivationKey: (activationKeyId: string) => Promise<PortalActionResult>;
  deleteActivationKey: (activationKeyId: string) => Promise<PortalActionResult>;
  changePlan: (planId: string, selectedAddOns?: string[]) => Promise<PortalActionResult>;
  cancelPlan: (reason?: string) => Promise<PortalActionResult>;
  reviewDocument: (documentId: string, payload: { reviewStatus: string; reviewNotes?: string }) => Promise<PortalActionResult>;
  updateIncidentStatus: (incidentId: string, status: 'open' | 'in_progress' | 'resolved') => Promise<PortalActionResult>;
  revokeSession: (sessionId: string) => Promise<PortalActionResult>;
  applyRealtimeEvent: (eventName: string, payload?: unknown) => void;
  reset: () => void;
  clearError: () => void;
};
