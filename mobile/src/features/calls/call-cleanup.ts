// RC-MOBILE-CALLS-PRODUCTION-01 Bloque C.9 — Epoch + cleanup idempotente.
// El epoch impide que promesas/callbacks de una llamada ANTIGUA modifiquen una llamada NUEVA.

export interface CallEpoch {
  next(callId: string | null): number; // arranca una nueva generacion; devuelve el epoch nuevo
  current(): number;
  currentCallId(): string | null;
  isCurrent(epoch: number): boolean;
  // Guard para callbacks nativos: solo ejecuta fn si el epoch sigue vigente.
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
        if (candidate !== epoch) return; // pertenece a una llamada vieja -> ignorar
        fn(...args);
      };
    },
  };
}

// Cleanup idempotente: cada paso corre en try/catch; llamarlo varias veces no falla ni repite.
export function createIdempotentCleanup(steps: Array<() => void>): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    for (const step of steps) {
      try {
        step();
      } catch {
        // el cleanup nunca debe lanzar; cada paso es best-effort
      }
    }
  };
}
