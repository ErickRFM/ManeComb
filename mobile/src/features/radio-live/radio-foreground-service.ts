import {
  startRadioForegroundService,
  stopRadioForegroundService,
} from '@/src/native/audio';

export type RadioForegroundServiceOwner = 'global' | 'screen';

const owners = new Set<RadioForegroundServiceOwner>();
const SCREEN_HANDOFF_RESTART_MS = 120;
const STOP_GRACE_MS = 350;

let serviceActive = false;
let pendingRestart: ReturnType<typeof setTimeout> | null = null;
let pendingRestartResolve: (() => void) | null = null;
let pendingStop: ReturnType<typeof setTimeout> | null = null;
let pendingStopResolve: (() => void) | null = null;
let operationQueue: Promise<void> = Promise.resolve();

function enqueue(operation: () => Promise<void>) {
  const next = operationQueue.then(operation, operation);
  operationQueue = next.catch(() => undefined);
  return next;
}

function cancelPendingRestart() {
  if (pendingRestart) {
    clearTimeout(pendingRestart);
    pendingRestart = null;
  }

  const resolve = pendingRestartResolve;
  pendingRestartResolve = null;
  resolve?.();
}

function cancelPendingStop() {
  if (pendingStop) {
    clearTimeout(pendingStop);
    pendingStop = null;
  }

  const resolve = pendingStopResolve;
  pendingStopResolve = null;
  resolve?.();
}

function restartForRemainingOwner() {
  cancelPendingRestart();

  return new Promise<void>((resolve) => {
    pendingRestartResolve = resolve;
    pendingRestart = setTimeout(() => {
      pendingRestart = null;
      pendingRestartResolve = null;
      enqueue(async () => {
        if (owners.size === 0) return;
        await startRadioForegroundService();
        serviceActive = true;
      }).finally(resolve);
    }, SCREEN_HANDOFF_RESTART_MS);
  });
}

export function acquireRadioForegroundService(owner: RadioForegroundServiceOwner) {
  owners.add(owner);
  cancelPendingStop();

  return enqueue(async () => {
    if (!owners.has(owner) || serviceActive) return;

    await startRadioForegroundService();

    if (owners.size === 0) {
      await stopRadioForegroundService().catch(() => undefined);
      return;
    }

    serviceActive = true;
  });
}

export function releaseRadioForegroundService(owner: RadioForegroundServiceOwner) {
  owners.delete(owner);

  if (owner === 'screen' && owners.size > 0) {
    serviceActive = false;
    cancelPendingStop();
    return restartForRemainingOwner();
  }

  if (owners.size > 0) return Promise.resolve();

  cancelPendingRestart();
  cancelPendingStop();

  return new Promise<void>((resolve) => {
    pendingStopResolve = resolve;
    pendingStop = setTimeout(() => {
      pendingStop = null;
      pendingStopResolve = null;
      enqueue(async () => {
        if (owners.size > 0 || !serviceActive) return;
        serviceActive = false;
        await stopRadioForegroundService().catch(() => undefined);
      }).finally(resolve);
    }, STOP_GRACE_MS);
  });
}

export function resetRadioForegroundService() {
  owners.clear();
  cancelPendingRestart();
  cancelPendingStop();

  return enqueue(async () => {
    serviceActive = false;
    await stopRadioForegroundService().catch(() => undefined);
  });
}
