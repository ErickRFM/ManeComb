export type NetworkRecoverySnapshot = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

export function hasPhysicalNetworkLink(
  snapshot: NetworkRecoverySnapshot | null | undefined
) {
  return snapshot?.isConnected !== false;
}

export function getForegroundNetworkSignal(
  snapshot: NetworkRecoverySnapshot | null | undefined
): 'online' | 'offline' | 'recovering' {
  if (snapshot?.isConnected === false) {
    return 'offline';
  }

  if (!snapshot || snapshot.isInternetReachable !== true) {
    return 'recovering';
  }

  return 'online';
}
