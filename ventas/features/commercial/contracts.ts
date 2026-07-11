import type { CommercialPlan, PortalSubscription } from '@/src/types/app';
import type {
  CommercialActivity,
  CommercialChangeSummary,
  CommercialContextSnapshot,
  CommercialDashboardModel,
  CommercialStatePresentation,
  CommercialWorkspace,
  PlanChangeValidation,
  PaymentProviderMode,
  PaymentResult,
  PaymentReturnRequest,
  PaymentSession,
  PaymentSessionRequest,
  TestCardInput,
} from './types';

export interface PlanRepository {
  replace(plans: CommercialPlan[]): Promise<void>;
  list(): Promise<CommercialPlan[]>;
  findById(planId: string): Promise<CommercialPlan | null>;
}

export interface SubscriptionRepository {
  replace(subscription: PortalSubscription | null): Promise<void>;
  getCurrent(): Promise<PortalSubscription | null>;
}

export interface CommercialTimelineRepository {
  replace(events: CommercialActivity[]): Promise<void>;
  append(event: CommercialActivity): Promise<void>;
  list(): Promise<CommercialActivity[]>;
}

export interface SubscriptionValidator {
  validate(input: {
    subscription: PortalSubscription | null;
    currentPlan: CommercialPlan | null;
    targetPlan: CommercialPlan | null;
    state: CommercialStatePresentation;
  }): PlanChangeValidation;
}

export interface SubscriptionService {
  synchronize(snapshot: CommercialContextSnapshot): Promise<void>;
  getWorkspace(): Promise<CommercialWorkspace>;
  evaluateChange(planId: string): Promise<CommercialChangeSummary>;
  registerPreview(planId: string): Promise<CommercialActivity>;
  getDashboardModel(input: { activationComplete: boolean }): Promise<CommercialDashboardModel>;
}

export interface BillingService {
  getStatus(): Promise<{ available: boolean; message: string }>;
}

export interface PaymentProvider {
  readonly id: string;
  getCapabilities(): Promise<{
    available: boolean;
    supportsRecurringPayments: boolean;
    supportsProration: boolean;
  }>;
  createSession(request: PaymentSessionRequest): Promise<PaymentSession>;
}

export interface CheckoutService {
  listPlans(): Promise<CommercialPlan[]>;
  getProviderMode(): Promise<PaymentProviderMode>;
  validateTestCard(input: TestCardInput): string | null;
  createPaymentSession(request: PaymentSessionRequest): Promise<PaymentResult>;
  confirmPaymentReturn(request: PaymentReturnRequest): Promise<PaymentResult>;
}
