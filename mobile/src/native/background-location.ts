import { NativeModules, Platform } from 'react-native';
import type { OperationalSchedule } from '@/src/types/app';

type ManeCombLocationModule = {
  startService: (
    apiUrl: string,
    token: string,
    vehicleId: string,
    scheduleEnabled: boolean,
    scheduleStart: string,
    scheduleEnd: string,
    activeDays: number[]
  ) => Promise<boolean>;
  stopService: () => Promise<boolean>;
};

const NativeLocation =
  Platform.OS === 'android'
    ? (NativeModules.ManeCombLocation as ManeCombLocationModule | undefined)
    : undefined;

export async function startBackgroundLocationServiceAsync({
  apiUrl,
  schedule,
  token,
  vehicleId,
}: {
  apiUrl: string;
  schedule: OperationalSchedule | null | undefined;
  token: string;
  vehicleId: string;
}) {
  if (!NativeLocation || !apiUrl || !token || !vehicleId) {
    return false;
  }

  return await NativeLocation.startService(
    apiUrl,
    token,
    vehicleId,
    schedule?.enabled !== false,
    schedule?.startTime || '',
    schedule?.endTime || '',
    schedule?.activeDays || []
  );
}

export async function stopBackgroundLocationServiceAsync() {
  if (!NativeLocation) {
    return false;
  }

  return await NativeLocation.stopService();
}
