import { clampVolume } from '../utils/radio-format';

export async function withRadioTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function normalizeMeteringDecibels(metering?: number) {
  if (typeof metering !== 'number' || Number.isNaN(metering)) {
    return 0;
  }

  return clampVolume((metering + 62) / 52);
}

export function getRadioRealtimeErrorMessage(error?: string) {
  const value = String(error || '').toLowerCase();
  if (value.includes('unauthorized') || value.includes('invalid token') || value.includes('jwt')) {
    return 'Sesion expirada';
  }
  if (value.includes('forbidden')) return 'Sin permisos para transmitir';
  if (value.includes('timeout')) return 'Servidor no disponible';
  return 'Error de conexion';
}

export function getTimeDomainVolume(samples: Uint8Array) {
  if (!samples.length) {
    return 0;
  }

  let sumSquares = 0;
  let peak = 0;

  samples.forEach((sample) => {
    const centered = (sample - 128) / 128;
    const absolute = Math.abs(centered);
    sumSquares += centered * centered;
    peak = Math.max(peak, absolute);
  });

  const rms = Math.sqrt(sumSquares / samples.length);
  const gatedRms = Math.max(0, rms - 0.012);
  return clampVolume(gatedRms / 0.16 + peak * 0.24);
}

export function getDeviceDisplayName(
  devices: MediaDeviceInfo[],
  selectedId: string,
  fallback: string
) {
  const selected =
    devices.find((device) => device.deviceId === selectedId) ||
    devices.find((device) => device.deviceId === 'default') ||
    devices[0];

  if (!selected?.label) {
    return fallback;
  }

  return selected.label.replace(/\s*\([^)]*\)\s*$/, '').trim() || fallback;
}
