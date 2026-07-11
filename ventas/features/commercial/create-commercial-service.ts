import { FALLBACK_COMMERCIAL_PLANS } from '@/src/constants/commercial';
import {
  InMemoryPlanRepository,
  InMemorySubscriptionRepository,
  InMemoryTimelineRepository,
  SimulatedBillingService,
  SimulatedPaymentProvider,
} from './adapters/in-memory-commercial-adapters';
import { DefaultSubscriptionValidator } from './rules/subscription-validator';
import { DefaultSubscriptionService } from './services/commercial-engine';
import { ApiCheckoutServiceAdapter } from './adapters/api-checkout-service-adapter';

export function createCommercialService() {
  const billingService = new SimulatedBillingService();
  const paymentProvider = new SimulatedPaymentProvider();
  const service = new DefaultSubscriptionService(
    new InMemoryPlanRepository(),
    new InMemorySubscriptionRepository(),
    new InMemoryTimelineRepository(),
    new DefaultSubscriptionValidator()
  );

  return {
    billingService,
    paymentProvider,
    service,
    plans: FALLBACK_COMMERCIAL_PLANS.map((plan) => ({ ...plan })),
  };
}

export function createCheckoutService() {
  return new ApiCheckoutServiceAdapter();
}
