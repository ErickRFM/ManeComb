import {
  InMemoryPlanRepository,
  InMemorySubscriptionRepository,
  InMemoryTimelineRepository,
} from './adapters/in-memory-commercial-adapters';
import { DefaultSubscriptionValidator } from './rules/subscription-validator';
import { DefaultSubscriptionService } from './services/commercial-engine';
import { ApiCheckoutServiceAdapter } from './adapters/api-checkout-service-adapter';

export function createCommercialService() {
  const service = new DefaultSubscriptionService(
    new InMemoryPlanRepository(),
    new InMemorySubscriptionRepository(),
    new InMemoryTimelineRepository(),
    new DefaultSubscriptionValidator()
  );

  return {
    service,
  };
}

export function createCheckoutService() {
  return new ApiCheckoutServiceAdapter();
}
