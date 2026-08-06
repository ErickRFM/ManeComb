import { AppState, NativeModules, Platform } from 'react-native';
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
  vehicleId: string | null;
  sessionIdPresent: boolean;
  trackingActive: boolean;
  pendingPackets: number;
  droppedPackets: number;
  lastCapturedAt: number | null;
  lastSentAt: number | null;
  lastConfirmedAt: number | null;
};

export type LocationCaptureOwner =
  | 'FOREGROUND_REACT'
  | 'BACKGROUND_ANDROID'
  | 'TRANSITIONING'
  | 'DISABLED';

export type BackgroundLocationServiceOwner =
  | 'operational-runtime'
  | 'journey'
  | 'legacy';

type BackgroundLocationConfig = {
  apiUrl: string;
  schedule: OperationalSchedule | null | undefined;
  token: string;
  refreshToken: string;
  vehicleId: string;
  sessionId: string;
};

export function getLocationCaptureOwner({
  appState,
  backgroundServiceActive,
  foregroundWatcherActive,
}: {
  appState: string;
  backgroundServiceActive: boolean;
  foregroundWatcherActive: boolean;
}): LocationCaptureOwner {
  if (appState === 'active') {
    if (foregroundWatcherActive && backgroundServiceActive) return 'TRANSITIONING';
    return foregroundWatcherActive ? 'FOREGROUND_REACT' : 'DISABLED';
  }

  if (foregroundWatcherActive && backgroundServiceActive) return 'TRANSITIONING';
  return backgroundServiceActive ? 'BACKGROUND_ANDROID' : 'DISABLED';
}

const NativeLocation =
  Platform.OS === 'android'
    ? (NativeModules.ManeCombLocation as ManeCombLocationModule | undefined)
    : undefined;

const ownerPriority: BackgroundLocationServiceOwner[] = [
  'journey',
  'operational-runtime',
  'legacy',
];
const ownerConfigs = new Map<BackgroundLocationServiceOwner, BackgroundLocationConfig>();
let appliedConfig: BackgroundLocationConfig | null = null;
let serviceActive = false;
let operationQueue: Promise<boolean> = Promise.resolve(false);

function enqueue(operation: () => Promise<boolean>) {
  const next = operationQueue.then(operation, operation);
  operationQueue = next.catch(() => false);
  return next;
}

function normalizeConfig(config: BackgroundLocationConfig): BackgroundLocationConfig {
  return {
    ...config,
    apiUrl: config.apiUrl.trim().replace(/\/+$/, ''),
    refreshToken: config.refreshToken.trim(),
    sessionId: config.sessionId.trim(),
    token: config.token.trim(),
    vehicleId: config.vehicleId.trim(),
  };
}

function schedulesMatch(
  left: OperationalSchedule | null | undefined,
  right: OperationalSchedule | null | undefined
) {
  return (
    (left?.enabled !== false) === (right?.enabled !== false) &&
    (left?.startTime || '') === (right?.startTime || '') &&
    (left?.endTime || '') === (right?.endTime || '') &&
    JSON.stringify(left?.activeDays || []) === JSON.stringify(right?.activeDays || [])
  );
}

function configsMatch(
  left: BackgroundLocationConfig | null | undefined,
  right: BackgroundLocationConfig | null | undefined
) {
  if (!left || !right) return left === right;

  return (
    left.apiUrl === right.apiUrl &&
    left.token === right.token &&
    left.refreshToken === right.refreshToken &&
    left.vehicleId === right.vehicleId &&
    left.sessionId === right.sessionId &&
    schedulesMatch(left.schedule, right.schedule)
  );
}

function getSelectedConfig() {
  for (const owner of ownerPriority) {
    const config = ownerConfigs.get(owner);
    if (config) return config;
  }
  return null;
}

function isValidConfig(config: BackgroundLocationConfig) {
  return Boolean(
    NativeLocation &&
      config.apiUrl.trim() &&
      config.token.trim() &&
      config.vehicleId.trim()
  );
}

function reconcileBackgroundLocationService() {
  return enqueue(async () => {
    if (!NativeLocation) return false;

    const config = getSelectedConfig();
    if (!config) {
      const stopped = await NativeLocation.stopService().catch(() => false);
      serviceActive = false;
      appliedConfig = null;
      return stopped;
    }

    // Keep the lease while React owns foreground capture. The service is started
    // only after the app moves to background, avoiding duplicate GPS listeners.
    if (AppState.currentState === 'active') {
      return true;
    }

    if (serviceActive && configsMatch(appliedConfig, config)) {
      return true;
    }

    const started = await NativeLocation.startService(
      config.apiUrl,
      config.token,
      config.refreshToken,
      config.vehicleId,
      config.sessionId,
      config.schedule?.enabled !== false,
      config.schedule?.startTime || '',
      config.schedule?.endTime || '',
      config.schedule?.activeDays || []
    );

    if (started) {
      serviceActive = true;
      appliedConfig = { ...config };
    }

    return started;
  });
}

export function acquireBackgroundLocationServiceAsync(
  owner: BackgroundLocationServiceOwner,
  config: BackgroundLocationConfig
) {
  if (!isValidConfig(config)) {
    ownerConfigs.delete(owner);
    return reconcileBackgroundLocationService();
  }

  const normalizedConfig = normalizeConfig(config);
  ownerConfigs.set(owner, normalizedConfig);

  // The operational runtime reflects the canonical store state. Remove a stale
  // journey lease after token, vehicle, schedule or session changes.
  if (owner === 'operational-runtime') {
    const journeyConfig = ownerConfigs.get('journey');
    if (journeyConfig && !configsMatch(journeyConfig, normalizedConfig)) {
      ownerConfigs.delete('journey');
    }
  }

  return reconcileBackgroundLocationService();
}

export function releaseBackgroundLocationServiceAsync(
  owner: BackgroundLocationServiceOwner
) {
  ownerConfigs.delete(owner);
  return reconcileBackgroundLocationService();
}

export async function startBackgroundLocationServiceAsync(
  config: BackgroundLocationConfig
) {
  const owner: BackgroundLocationServiceOwner = config.sessionId.trim()
    ? 'journey'
    : 'legacy';
  return acquireBackgroundLocationServiceAsync(owner, config);
}

/**
 * Compatibility stop for existing callers. It releases legacy/journey intent,
 * but cannot tear down the current operational-runtime lease.
 */
export async function stopBackgroundLocationServiceAsync() {
  ownerConfigs.delete('journey');
  ownerConfigs.delete('legacy');
  return reconcileBackgroundLocationService();
}

export async function resetBackgroundLocationServiceAsync() {
  ownerConfigs.clear();
  return reconcileBackgroundLocationService();
}

export async function getBackgroundLocationServiceStatusAsync(): Promise<BackgroundLocationServiceStatus> {
  if (!NativeLocation) {
    return {
      active: false,
      reason: null,
      vehicleId: null,
      sessionIdPresent: false,
      trackingActive: false,
      pendingPackets: 0,
      droppedPackets: 0,
      lastCapturedAt: null,
      lastSentAt: null,
      lastConfirmedAt: null,
    };
  }

  const status = await NativeLocation.getServiceStatus();
  serviceActive = status.active;
  if (!status.active) {
    appliedConfig = null;
  }
  return status;
}

export function getBackgroundLocationOwnershipSnapshot() {
  return {
    appliedVehicleId: appliedConfig?.vehicleId || null,
    hasAppliedConfig: Boolean(appliedConfig),
    owners: [...ownerConfigs.keys()],
    serviceActive,
    sessionIdPresent: Boolean(appliedConfig?.sessionId),
  };
}
