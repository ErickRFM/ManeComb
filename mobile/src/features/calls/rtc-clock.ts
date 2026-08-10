const MAX_CALIBRATION_AGE_MS = 60_000;
const CLOCK_JUMP_TOLERANCE_MS = 2_000;

type ClockSample = {
  offsetMs: number;
  localWallMs: number;
  monotonicMs: number;
};

let sample: ClockSample | null = null;

function monotonicNow(): number {
  const candidate = globalThis.performance?.now?.();
  return Number.isFinite(candidate) ? Number(candidate) : Date.now();
}

export function calibrateRtcServerClock(
  serverTime: string | null | undefined,
  localWallMs: number = Date.now(),
  monotonicMs: number = monotonicNow()
): boolean {
  const serverMs = Date.parse(String(serverTime || '').trim());
  if (!Number.isFinite(serverMs) || !Number.isFinite(localWallMs) || !Number.isFinite(monotonicMs)) {
    return false;
  }

  sample = {
    offsetMs: serverMs - localWallMs,
    localWallMs,
    monotonicMs,
  };
  return true;
}

export function getRtcServerNowMs(
  localWallMs: number = Date.now(),
  monotonicMs: number = monotonicNow()
): number {
  const current = sample;
  if (!current) return localWallMs;

  const monotonicElapsed = monotonicMs - current.monotonicMs;
  const wallElapsed = localWallMs - current.localWallMs;
  if (
    monotonicElapsed < 0 ||
    monotonicElapsed > MAX_CALIBRATION_AGE_MS ||
    Math.abs(wallElapsed - monotonicElapsed) > CLOCK_JUMP_TOLERANCE_MS
  ) {
    sample = null;
    return localWallMs;
  }

  return localWallMs + current.offsetMs;
}

export function normalizeRtcDeadline(
  expiresAt: string | null | undefined,
  localWallMs: number = Date.now(),
  monotonicMs: number = monotonicNow()
): string | null {
  const raw = String(expiresAt || '').trim();
  if (!raw) return null;
  const expiresAtMs = Date.parse(raw);
  if (!Number.isFinite(expiresAtMs)) return raw;

  const serverNowMs = getRtcServerNowMs(localWallMs, monotonicMs);
  if (!sample) return raw;

  const remainingMs = expiresAtMs - serverNowMs;
  return new Date(localWallMs + remainingMs).toISOString();
}

export function __resetRtcServerClockForTests(): void {
  sample = null;
}

export const RTC_CLOCK_CALIBRATION_MAX_AGE_MS = MAX_CALIBRATION_AGE_MS;
