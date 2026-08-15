import { createLatestEffectCoordinator, createResourceLoadCoordinator } from '@shared/resource-load-coordinator';
import { beginResourceAttempt, completeResourceAttempt, failResourceAttempt, idleResourceState } from '@shared/resource-state';

function resourceHarness() {
  const coordinator = createResourceLoadCoordinator<'billing'>();
  let data: string[] = [];
  let resource = idleResourceState();
  const begin = () => {
    resource = beginResourceAttempt(resource);
    return coordinator.begin('billing');
  };
  const success = (generation: number, nextData: string[]) => {
    const completion = coordinator.finish('billing', generation);
    if (completion.isLatest) {
      data = nextData;
      resource = completeResourceAttempt(resource, { empty: nextData.length === 0, source: 'rest' });
    }
  };
  const fail = (generation: number) => {
    const completion = coordinator.finish('billing', generation);
    if (completion.isLatest) resource = failResourceAttempt(resource, { errorCode: '500', errorMessage: 'boom' });
  };
  return { begin, success, fail, read: () => ({ data, resource }) };
}

describe('same-domain resource load coordinator', () => {
  it('allows only the latest generation to commit when B succeeds before A', () => {
    const coordinator = createResourceLoadCoordinator<'billing'>();
    const a = coordinator.begin('billing');
    const b = coordinator.begin('billing');
    expect(coordinator.finish('billing', b)).toEqual({ isLatest: true, isLoading: true });
    expect(coordinator.finish('billing', a)).toEqual({ isLatest: false, isLoading: false });
  });

  it('tracks concurrent billing/loadAll attempts and concurrent overview attempts independently', () => {
    const coordinator = createResourceLoadCoordinator<'billing' | 'account'>();
    const billing = coordinator.begin('billing');
    const loadAllBilling = coordinator.begin('billing');
    const overviewA = coordinator.begin('account');
    const overviewB = coordinator.begin('account');
    expect(coordinator.finish('billing', billing).isLatest).toBe(false);
    expect(coordinator.finish('account', overviewA).isLatest).toBe(false);
    expect(coordinator.finish('billing', loadAllBilling).isLatest).toBe(true);
    expect(coordinator.finish('account', overviewB)).toEqual({ isLatest: true, isLoading: false });
  });

  it('keeps successful data stale when a later current attempt fails (A success, B fail)', () => {
    const harness = resourceHarness();
    const a = harness.begin();
    harness.success(a, ['invoice-1']);
    const b = harness.begin();
    harness.fail(b);
    expect(harness.read().data).toEqual(['invoice-1']);
    expect(harness.read().resource.status).toBe('stale');
  });

  it('lets a later success recover a previous failure (A fail, B success)', () => {
    const harness = resourceHarness();
    const a = harness.begin();
    harness.fail(a);
    const b = harness.begin();
    harness.success(b, ['invoice-2']);
    expect(harness.read().data).toEqual(['invoice-2']);
    expect(harness.read().resource.status).toBe('ready');
  });

  it('ignores A after B succeeds first', () => {
    const harness = resourceHarness();
    const a = harness.begin();
    const b = harness.begin();
    harness.success(b, ['new']);
    harness.success(a, ['old']);
    expect(harness.read().data).toEqual(['new']);
    expect(harness.read().resource.status).toBe('ready');
  });

  it('does not let an old failure write global error after B succeeds', () => {
    const coordinator = createLatestEffectCoordinator();
    let globalError: string | null = null;
    const a = coordinator.begin();
    const b = coordinator.begin();
    if (coordinator.isLatest(b)) globalError = null;
    if (coordinator.isLatest(a)) globalError = 'old failure';
    expect(globalError).toBeNull();
  });

  it('does not let an old success clear the current error from B', () => {
    const coordinator = createLatestEffectCoordinator();
    let globalError: string | null = null;
    const a = coordinator.begin();
    const b = coordinator.begin();
    if (coordinator.isLatest(b)) globalError = 'current failure';
    if (coordinator.isLatest(a)) globalError = null;
    expect(globalError).toBe('current failure');
  });
});
