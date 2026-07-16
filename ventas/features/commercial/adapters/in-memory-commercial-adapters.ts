import type { CommercialPlan, PortalSubscription } from '@/src/types/app';
import type {
  CommercialTimelineRepository,
  PlanRepository,
  SubscriptionRepository,
} from '../contracts';
import type { CommercialActivity } from '../types';

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

  async list() {
    return [...this.events]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .map((event) => ({ ...event, metadata: event.metadata ? { ...event.metadata } : undefined }));
  }
}
