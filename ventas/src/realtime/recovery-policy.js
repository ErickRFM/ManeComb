export const DISCONNECTED_RECONCILE_MS = 4_000;

const RECOVERABLE_SOCKET_STATUSES = new Set(['disconnected', 'error', 'reconnecting']);

export function shouldReconcileDisconnected({ socketStatus, visible, disconnectedForMs }) {
  return Boolean(
    visible
      && RECOVERABLE_SOCKET_STATUSES.has(String(socketStatus || ''))
      && Number.isFinite(disconnectedForMs)
      && disconnectedForMs >= DISCONNECTED_RECONCILE_MS
  );
}

export function shouldResyncAfterTokenRotation({ previousToken, nextToken, userId }) {
  return Boolean(
    previousToken
      && nextToken
      && userId
      && previousToken !== nextToken
  );
}
