import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import {
  API_ORIGIN,
  API_URL,
  SOCKET_URL,
  isDevRuntime,
  mobileLog,
  runtimeNetworkConfig,
} from '@/src/config/api_config';

export { API_ORIGIN, API_URL, SOCKET_URL, isDevRuntime, mobileLog, runtimeNetworkConfig };

export type MobileNetworkSnapshot = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  type: string;
  expensive: boolean;
};

function toNetworkSnapshot(state: NetInfoState): MobileNetworkSnapshot {
  return {
    isConnected: state.isConnected,
    isInternetReachable: state.isInternetReachable,
    type: state.type,
    expensive: Boolean(
      state.details && 'isConnectionExpensive' in state.details
        ? state.details.isConnectionExpensive
        : false
    ),
  };
}

export function subscribeMobileNetwork(callback: (snapshot: MobileNetworkSnapshot) => void) {
  return NetInfo.addEventListener((state) => {
    callback(toNetworkSnapshot(state));
  });
}

export async function getMobileNetworkSnapshot() {
  return toNetworkSnapshot(await NetInfo.fetch());
}

export function isNetworkReachable(snapshot: MobileNetworkSnapshot | null | undefined) {
  if (!snapshot) {
    return true;
  }

  if (snapshot.isConnected === false) {
    return false;
  }

  return snapshot.isInternetReachable !== false;
}

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
