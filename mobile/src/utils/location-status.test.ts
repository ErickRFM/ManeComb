import { getLocationStatus } from './location-status';

describe('location status', () => {
  it('blocks only GPS reporting when permission is denied', () => {
    const status = getLocationStatus({
      coordinatesReady: false,
      issue: null,
      loading: false,
      permission: 'denied',
      servicesEnabled: true,
    });

    expect(status.hudLabel).toBe('OFF');
    expect(status.issue).toBe('permission_denied');
    expect(status.canRetry).toBe(true);
  });

  it('does not report an undetermined permission as denied', () => {
    const pending = getLocationStatus({
      coordinatesReady: false,
      issue: null,
      loading: false,
      permission: 'undetermined',
      servicesEnabled: true,
    });
    const loading = getLocationStatus({
      coordinatesReady: false,
      issue: null,
      loading: true,
      permission: 'undetermined',
      servicesEnabled: true,
    });

    expect(pending.title).toBe('GPS pendiente');
    expect(pending.hudLabel).toBe('WAIT');
    expect(pending.issue).toBeNull();
    expect(loading.title).toBe('GPS sincronizando');
    expect(loading.hudLabel).toBe('...');
  });

  it('distinguishes disabled services from timeout', () => {
    const disabled = getLocationStatus({
      coordinatesReady: false,
      issue: 'services_disabled',
      loading: false,
      permission: 'granted',
      servicesEnabled: false,
    });
    const timeout = getLocationStatus({
      coordinatesReady: false,
      issue: 'timeout',
      loading: false,
      permission: 'granted',
      servicesEnabled: true,
    });

    expect(disabled.hudLabel).toBe('GPS');
    expect(timeout.hudLabel).toBe('TIME');
  });

  it('keeps operations available during low accuracy', () => {
    const status = getLocationStatus({
      coordinatesReady: true,
      issue: 'low_accuracy',
      loading: false,
      permission: 'granted',
      servicesEnabled: true,
    });

    expect(status.hudLabel).toBe('LOW');
    expect(status.tone).toBe('warning');
    expect(status.canRetry).toBe(true);
  });

  it('returns ok only when there is a trusted coordinate', () => {
    const status = getLocationStatus({
      coordinatesReady: true,
      issue: null,
      loading: false,
      permission: 'granted',
      servicesEnabled: true,
    });

    expect(status.hudLabel).toBe('OK');
    expect(status.canRetry).toBe(false);
  });
});
