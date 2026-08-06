export const SHARED_SOCKET_DISCOVERY_INTERVAL_MS = 25;
export const SHARED_SOCKET_DISCOVERY_MAX_ATTEMPTS = 160;

export function shouldRetrySharedRealtimeSocket(input: {
  attempt: number;
  hasSession: boolean;
  hasSocket: boolean;
  socketStatus: string;
}) {
  if (!input.hasSession || input.hasSocket) return false;
  if (input.attempt >= SHARED_SOCKET_DISCOVERY_MAX_ATTEMPTS) return false;

  return ['idle', 'connecting', 'reconnecting', 'disconnected', 'error'].includes(
    input.socketStatus
  );
}
