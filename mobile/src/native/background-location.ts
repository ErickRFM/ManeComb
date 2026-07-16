import { NativeModules, Platform } from 'react-native';
import type { OperationalSchedule } from '@/src/types/app';

type ManeCombLocationModule = {
  startService: (
    apiUrl: string,
    token: string,
    refreshToken: string,
    vehicleId: string,
    sessionId: string,
    scheduleEnabled: boolean,
    scheduleStart: string,
    scheduleEnd: string,
    activeDays: number[]
  ) => Promise<boolean>;
  stopService: () => Promise<boolean>;
  getServiceStatus: () => Promise<BackgroundLocationServiceStatus>;
};

export type BackgroundLocationServiceStatus = {
  active: boolean;
  reason: string | null;
  token: string | null;
  refreshToken: string | null;
};

const NativeLocation =
  Platform.OS === 'android'
    ? (NativeModules.ManeCombLocation as ManeCombLocationModule | undefined)
    : undefined;

export async function startBackgroundLocationServiceAsync({
  apiUrl,
  schedule,
  token,
  refreshToken,
  vehicleId,
  sessionId,
}: {
  apiUrl: string;
  schedule: OperationalSchedule | null | undefined;
  token: string;
  refreshToken: string;
  vehicleId: string;
  sessionId: string;
}) {
  if (!NativeLocation || !apiUrl || !token || !vehicleId) {
    return false;
  }

  return await NativeLocation.startService(
    apiUrl,
    token,
    refreshToken,
    vehicleId,
    sessionId,
    schedule?.enabled !== false,
    schedule?.startTime || '',
    schedule?.endTime || '',
    schedule?.activeDays || []
  );
}

export async function getBackgroundLocationServiceStatusAsync(): Promise<BackgroundLocationServiceStatus> {
  if (!NativeLocation) {
    return { active: false, reason: null, token: null, refreshToken: null };
  }

  return NativeLocation.getServiceStatus();
}

export async function stopBackgroundLocationServiceAsync() {
  if (!NativeLocation) {
    return false;
  }

  return await NativeLocation.stopService();
}
