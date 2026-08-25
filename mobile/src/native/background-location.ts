import { AppState, NativeModules, Platform } from 'react-native';
import type { OperationalSchedule } from '@/src/types/app';

type BackgroundLocationCredentialState = {
  token: string;
  refreshToken: string;
  refreshRequestId: string | null;
};

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
  hardStopService: () => Promise<boolean>;
  getServiceStatus: () => Promise<BackgroundLocationServiceStatus>;
  getCredentialState: () => Promise<BackgroundLocationCredentialState | null>;
  setCredentials: (token: string, refreshToken: string) => Promise<boolean>;
  setRefreshRequestId: (refreshRequestId: string | null) => Promise<boolean>;
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
  lastPacketId: string | null;
  lastPacketCapturedAt: number | null;
  lastPacketSentAt: number | null;
  lastPacketConfirmedAt: number | null;
  lastPacketRoundTripMs: number | null;
};

export type LocationCaptureOwner =
  | 'FOREGROUND_REACT'
  | 'BACKGROUND_ANDROID'
  | 'TRANSITIONING'
  | 'DISABLED';

export type BackgroundLocationServiceOwner = 'operational-runtime';

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

let ownerConfig: BackgroundLocationConfig | null = null;
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

    const config = ownerConfig;
    if (!config) {
      const stopped = await NativeLocation.stopService().catch(() => false);
      serviceActive = false;
      appliedConfig = null;
      return stopped;
    }

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
  if (owner !== 'operational-runtime') {
    return Promise.resolve(false);
  }

  if (!isValidConfig(config)) {
    ownerConfig = null;
    return reconcileBackgroundLocationService();
  }

  ownerConfig = normalizeConfig(config);
  return reconcileBackgroundLocationService();
}

export function releaseBackgroundLocationServiceAsync(
  owner: BackgroundLocationServiceOwner
) {
  if (owner === 'operational-runtime') {
    ownerConfig = null;
  }
  return reconcileBackgroundLocationService();
}

export async function resetBackgroundLocationServiceAsync() {
  ownerConfig = null;
  return reconcileBackgroundLocationService();
}

export function hardResetBackgroundLocationServiceAsync() {
  ownerConfig = null;
  appliedConfig = null;
  serviceActive = false;

  return enqueue(async () => {
    if (!NativeLocation) return false;
    const stopped = await NativeLocation.hardStopService().catch(() => false);
    serviceActive = false;
    appliedConfig = null;
    return stopped;
  });
}

export async function getBackgroundLocationCredentialStateAsync(): Promise<BackgroundLocationCredentialState | null> {
  if (!NativeLocation) return null;
  return NativeLocation.getCredentialState().catch(() => null);
}

export async function setBackgroundLocationCredentialsAsync(token: string, refreshToken: string) {
  if (!NativeLocation || !token.trim() || !refreshToken.trim()) return false;
  const updated = await NativeLocation.setCredentials(token, refreshToken).catch(() => false);
  if (updated) {
    if (ownerConfig) ownerConfig = { ...ownerConfig, token, refreshToken };
    if (appliedConfig) appliedConfig = { ...appliedConfig, token, refreshToken };
  }
  return updated;
}

export async function setBackgroundLocationRefreshRequestIdAsync(refreshRequestId: string | null) {
  if (!NativeLocation) return false;
  return NativeLocation.setRefreshRequestId(refreshRequestId).catch(() => false);
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
      lastPacketId: null,
      lastPacketCapturedAt: null,
      lastPacketSentAt: null,
      lastPacketConfirmedAt: null,
      lastPacketRoundTripMs: null,
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
    owners: ownerConfig ? (['operational-runtime'] as BackgroundLocationServiceOwner[]) : [],
    serviceActive,
    sessionIdPresent: Boolean(appliedConfig?.sessionId),
  };
}
