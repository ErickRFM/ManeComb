export const PORTAL_LOAD_TTL_MS = 30_000;

export const emptyPortalState = {
  overview: null,
  onboarding: null,
  subscription: null,
  activationKeys: [],
  activationSummary: null,
  invoices: [],
  sessions: [],
  documents: [],
  incidents: [],
  appInfo: null,
  isLoading: false,
  isSubmitting: false,
  error: null,
  resources: {
    account: idleResourceState(),
    billing: idleResourceState(),
    sessions: idleResourceState(),
    documents: idleResourceState(),
    incidents: idleResourceState(),
    appInfo: idleResourceState(),
    operational: idleResourceState(),
  },
};
import { idleResourceState } from '@shared/resource-state';
