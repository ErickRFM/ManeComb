import type { CommercialPlan, PortalSubscription } from '@/src/types/app';
import type {
  BillingService,
  CommercialTimelineRepository,
  PaymentProvider,
  PlanRepository,
  SubscriptionRepository,
} from '../contracts';
import { PAYMENT_SESSION_STATUSES, type CommercialActivity, type PaymentSessionRequest } from '../types';

export class InMemoryPlanRepository implements PlanRepository {
  private plans: CommercialPlan[] = [];

  async replace(plans: CommercialPlan[]) {
    this.plans = plans.map((plan) => ({ ...plan }));
  }

  async list() {
    return this.plans.map((plan) => ({ ...plan }));
  }

  async findById(planId: string) {
    const plan = this.plans.find((item) => item.id === planId);
    return plan ? { ...plan } : null;
  }
}

export class InMemorySubscriptionRepository implements SubscriptionRepository {
  private subscription: PortalSubscription | null = null;

  async replace(subscription: PortalSubscription | null) {
    this.subscription = subscription ? { ...subscription } : null;
  }

  async getCurrent() {
    return this.subscription ? { ...this.subscription } : null;
  }
}

export class InMemoryTimelineRepository implements CommercialTimelineRepository {
  private events: CommercialActivity[] = [];

  async replace(events: CommercialActivity[]) {
    this.events = events.map((event) => ({ ...event, metadata: event.metadata ? { ...event.metadata } : undefined }));
  }

  async append(event: CommercialActivity) {
    this.events = [event, ...this.events.filter((item) => item.id !== event.id)];
  }

  async list() {
    return [...this.events]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .map((event) => ({ ...event, metadata: event.metadata ? { ...event.metadata } : undefined }));
  }
}

export class SimulatedBillingService implements BillingService {
  async getStatus() {
    return {
      available: false,
      message: 'La facturación avanzada se conectará en una fase posterior.',
    };
  }
}

export class SimulatedPaymentProvider implements PaymentProvider {
  readonly id = 'simulated';

  async getCapabilities() {
    return {
      available: false,
      supportsRecurringPayments: false,
      supportsProration: false,
    };
  }

  async createSession(request: PaymentSessionRequest) {
    return {
      id: `simulated-${request.planId}`,
      planId: request.planId,
      providerId: this.id,
      status: PAYMENT_SESSION_STATUSES.UNAVAILABLE,
      amount: 0,
      currency: 'MXN',
      checkoutUrl: null,
      createdAt: new Date().toISOString(),
    };
  }
}
