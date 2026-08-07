import {
  setRadioForegroundServiceState,
  startRadioForegroundService,
  stopRadioForegroundService,
} from '@/src/native/audio';

export type RadioForegroundServiceMode = 'listening' | 'transmitting';

// Unico coordinador del foreground service de Radio. Existe un solo duenio real
// (el runtime de radio-live); este modulo solo serializa las llamadas nativas y
// aplica una ventana de gracia para que un reinicio de runtime (cambio de canal,
// reconexion) no produzca stopService/startForegroundService cruzados.
const STOP_GRACE_MS = 350;

let wanted = false;
let serviceActive = false;
let serviceMode: RadioForegroundServiceMode = 'listening';
let pendingStop: ReturnType<typeof setTimeout> | null = null;
let pendingStopResolve: (() => void) | null = null;
let operationQueue: Promise<void> = Promise.resolve();

function enqueue(operation: () => Promise<void>) {
  const next = operationQueue.then(operation, operation);
  operationQueue = next.catch(() => undefined);
  return next;
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

export function acquireRadioForegroundService() {
  wanted = true;
  cancelPendingStop();

  return enqueue(async () => {
    if (!wanted || serviceActive) return;

    await startRadioForegroundService(serviceMode);

    if (!wanted) {
      await stopRadioForegroundService().catch(() => undefined);
      return;
    }

    serviceActive = true;
  });
}

export function releaseRadioForegroundService() {
  wanted = false;
  cancelPendingStop();

  return new Promise<void>((resolve) => {
    pendingStopResolve = resolve;
    pendingStop = setTimeout(() => {
      pendingStop = null;
      pendingStopResolve = null;
      enqueue(async () => {
        if (wanted || !serviceActive) return;
        serviceActive = false;
        serviceMode = 'listening';
        await stopRadioForegroundService().catch(() => undefined);
      }).finally(resolve);
    }, STOP_GRACE_MS);
  });
}

// El tipo de foreground service y el texto de la notificacion deben reflejar el
// estado real: microfono solo mientras se transmite.
export function setRadioForegroundServiceMode(mode: RadioForegroundServiceMode) {
  serviceMode = mode;

  return enqueue(async () => {
    if (!serviceActive || serviceMode !== mode) return;
    await setRadioForegroundServiceState(mode);
  });
}

export function resetRadioForegroundService() {
  wanted = false;
  serviceMode = 'listening';
  cancelPendingStop();

  return enqueue(async () => {
    serviceActive = false;
    await stopRadioForegroundService().catch(() => undefined);
  });
}

export function getRadioForegroundServiceOwnershipSnapshot() {
  return { wanted, serviceActive, serviceMode };
}
