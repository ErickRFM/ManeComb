export interface CallEpoch {
  next(callId: string | null): number;
  current(): number;
  currentCallId(): string | null;
  isCurrent(epoch: number): boolean;
  guard<T extends (...args: any[]) => void>(epoch: number, fn: T): (...args: Parameters<T>) => void;
}

export function createCallEpoch(): CallEpoch {
  let epoch = 0;
  let callId: string | null = null;
  return {
    next(nextCallId) {
      epoch += 1;
      callId = nextCallId;
      return epoch;
    },
    current() {
      return epoch;
    },
    currentCallId() {
      return callId;
    },
    isCurrent(candidate) {
      return candidate === epoch;
    },
    guard(candidate, fn) {
      return (...args) => {
        if (candidate !== epoch) return;
        fn(...args);
      };
    },
  };
}

export function createIdempotentCleanup(steps: Array<() => void>): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    for (const step of steps) {
      try {
        step();
      } catch {
        // Cleanup is best-effort and must never throw into UI state.
      }
    }
  };
}
