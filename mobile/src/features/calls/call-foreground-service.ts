import {
  startCallForegroundService,
  stopCallForegroundService,
} from '@/src/native/call-service';

export type CallForegroundServiceMode = 'audio' | 'video' | null;

let desiredMode: CallForegroundServiceMode = null;
let appliedMode: CallForegroundServiceMode = null;
let operationQueue: Promise<void> = Promise.resolve();
let revision = 0;

function enqueue(operation: () => Promise<void>) {
  const next = operationQueue.then(operation, operation);
  operationQueue = next.catch(() => undefined);
  return next;
}

function reconcile(expectedRevision: number) {
  return enqueue(async () => {
    // An intent superseded before its native operation begins is skipped.
    if (expectedRevision !== revision) return;

    const nextMode = desiredMode;
    if (!nextMode) {
      if (appliedMode) {
        await stopCallForegroundService();
        // The native stop happened even if a newer revision arrived while it was
        // in flight. Record reality; the queued newer revision will restart it.
        appliedMode = null;
      }
      return;
    }

    if (appliedMode === nextMode) return;

    await startCallForegroundService(nextMode === 'video');
    // The native start happened even if the desired state changed while awaiting
    // the bridge. Recording it lets the next queued reconcile stop/update it.
    appliedMode = nextMode;
  });
}

/**
 * Declares the foreground-service state required by the global call runtime.
 * Calls are serialized and latest-intent-wins, so React effect cleanup cannot
 * stop a newer call or cross a native start already in flight.
 */
export function setCallForegroundServiceMode(mode: CallForegroundServiceMode) {
  desiredMode = mode;
  revision += 1;
  return reconcile(revision);
}

export function resetCallForegroundService() {
  desiredMode = null;
  revision += 1;

  return enqueue(async () => {
    await stopCallForegroundService();
    appliedMode = null;
  });
}

export function getCallForegroundServiceSnapshot() {
  return {
    appliedMode,
    desiredMode,
    revision,
  };
}
