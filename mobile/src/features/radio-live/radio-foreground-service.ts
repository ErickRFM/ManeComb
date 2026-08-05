import {
  startRadioForegroundService,
  stopRadioForegroundService,
} from '@/src/native/audio';

export type RadioForegroundServiceOwner = 'global' | 'screen';

const owners = new Set<RadioForegroundServiceOwner>();
const STOP_GRACE_MS = 350;

let serviceActive = false;
let pendingStop: ReturnType<typeof setTimeout> | null = null;
let operationQueue: Promise<void> = Promise.resolve();

function enqueue(operation: () => Promise<void>) {
  const next = operationQueue.then(operation, operation);
  operationQueue = next.catch(() => undefined);
  return next;
}

function cancelPendingStop() {
  if (!pendingStop) return;
  clearTimeout(pendingStop);
  pendingStop = null;
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
  if (owners.size > 0) return Promise.resolve();

  cancelPendingStop();

  return new Promise<void>((resolve) => {
    pendingStop = setTimeout(() => {
      pendingStop = null;
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
  cancelPendingStop();

  return enqueue(async () => {
    serviceActive = false;
    await stopRadioForegroundService().catch(() => undefined);
  });
}
