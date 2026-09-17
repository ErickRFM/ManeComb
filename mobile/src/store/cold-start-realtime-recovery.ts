import { useAppStore } from './root-store';

const COLD_START_RECOVERY_RETRY_MS = 3000;

let coldStartRecoveryKey: string | null = null;
let coldStartRecoveryInFlight = false;
let coldStartRecoveryAttemptedAt = 0;

export function resetColdStartRealtimeRecovery() {
  coldStartRecoveryKey = null;
  coldStartRecoveryAttemptedAt = 0;
}

export function requestColdStartRealtimeRecovery(token: string, userId: string) {
  const recoveryKey = `${userId}:${token}`;
  const now = Date.now();

  if (
    coldStartRecoveryInFlight ||
    (coldStartRecoveryKey === recoveryKey &&
      now - coldStartRecoveryAttemptedAt < COLD_START_RECOVERY_RETRY_MS)
  ) {
    return;
  }

  coldStartRecoveryKey = recoveryKey;
  coldStartRecoveryAttemptedAt = now;
  coldStartRecoveryInFlight = true;

  void useAppStore
    .getState()
    .refreshAll()
    .catch(() => undefined)
    .finally(() => {
      coldStartRecoveryInFlight = false;
    });
}
