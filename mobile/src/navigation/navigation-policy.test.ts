import {
  createNavigationSignature,
  DeferredNavigationRequest,
  LatestNavigationRequest,
  NAVIGATION_DEDUP_WINDOW_MS,
  NavigationRequestGuard,
  shouldReturnToMapOnAndroidBack,
} from './navigation-policy';

describe('central navigation request guard', () => {
  it('ignores navigation to the current destination with identical parameters', () => {
    const guard = new NavigationRequestGuard();
    expect(
      guard.shouldIgnore({
        currentName: '/chat',
        currentParams: { conversationId: '15' },
        destinationName: '/chat',
        destinationParams: { conversationId: '15' },
      })
    ).toBe(true);
  });

  it('allows the same route when parameters identify different content', () => {
    const guard = new NavigationRequestGuard();
    expect(
      guard.shouldIgnore({
        currentName: '/chat',
        currentParams: { conversationId: '14' },
        destinationName: '/chat',
        destinationParams: { conversationId: '15' },
      })
    ).toBe(false);
  });

  it('collapses rapid repeated taps into one request', () => {
    const guard = new NavigationRequestGuard();
    expect(guard.shouldIgnore({ destinationName: '/radio', now: 1000 })).toBe(false);
    expect(guard.shouldIgnore({ destinationName: '/radio', now: 1001 })).toBe(true);
    expect(
      guard.shouldIgnore({ destinationName: '/radio', now: 1000 + NAVIGATION_DEDUP_WINDOW_MS })
    ).toBe(false);
  });

  it('creates stable signatures regardless of parameter order', () => {
    expect(createNavigationSignature('/mapa', { follow: true, vehicleId: '1' })).toBe(
      createNavigationSignature('/mapa', { vehicleId: '1', follow: true })
    );
  });

  it('keeps the latest redirect until the navigation container can consume it', () => {
    const deferred = new DeferredNavigationRequest<{ href: string; method: 'push' | 'replace' }>();

    deferred.defer({ href: '/plan-blocked', method: 'replace' });
    deferred.defer({ href: '/sync-error', method: 'replace' });

    expect(deferred.take()).toEqual({ href: '/sync-error', method: 'replace' });
    expect(deferred.take()).toBeNull();
  });

  it('can clear a deferred redirect when a newer navigation authority takes over', () => {
    const deferred = new DeferredNavigationRequest<string>();

    deferred.defer('/radio');
    deferred.clear();

    expect(deferred.take()).toBeNull();
  });

  it('allows only the latest asynchronous notification request to navigate', () => {
    const requests = new LatestNavigationRequest();
    const chat = requests.begin();
    const radio = requests.begin();
    const incidents = requests.begin();

    expect(requests.isLatest(chat)).toBe(false);
    expect(requests.isLatest(radio)).toBe(false);
    expect(requests.isLatest(incidents)).toBe(true);
  });

  it('returns from secondary module roots to map but exits natively from map', () => {
    expect(shouldReturnToMapOnAndroidBack('/chat')).toBe(true);
    expect(shouldReturnToMapOnAndroidBack('/perfil')).toBe(true);
    expect(shouldReturnToMapOnAndroidBack('/mapa')).toBe(false);
    expect(shouldReturnToMapOnAndroidBack('/perfil-editar')).toBe(false);
  });
});
