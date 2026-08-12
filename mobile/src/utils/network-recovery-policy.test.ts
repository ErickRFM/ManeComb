import {
  getForegroundNetworkSignal,
  hasPhysicalNetworkLink,
} from './network-recovery-policy';

describe('foreground network recovery policy', () => {
  it('keeps a Wi-Fi link eligible for a backend probe when reachability is stale', () => {
    const staleWifiSnapshot = {
      isConnected: true,
      isInternetReachable: false,
    };

    expect(hasPhysicalNetworkLink(staleWifiSnapshot)).toBe(true);
    expect(getForegroundNetworkSignal(staleWifiSnapshot)).toBe('recovering');
  });

  it('does not probe while the device has no physical network link', () => {
    const disconnectedSnapshot = {
      isConnected: false,
      isInternetReachable: false,
    };

    expect(hasPhysicalNetworkLink(disconnectedSnapshot)).toBe(false);
    expect(getForegroundNetworkSignal(disconnectedSnapshot)).toBe('offline');
  });

  it('treats an unknown foreground snapshot as recoverable', () => {
    expect(hasPhysicalNetworkLink(null)).toBe(true);
    expect(getForegroundNetworkSignal(null)).toBe('recovering');
  });
});
