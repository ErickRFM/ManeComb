export const SHARED_SOCKET_DISCOVERY_INTERVAL_MS = 25;
export const SHARED_SOCKET_DISCOVERY_MAX_ATTEMPTS = 160;
export const FLEET_REALTIME_INVALIDATION_EVENTS = [
  'driver:offboarded',
  'driver:reactivated',
  'vehicle:deleted',
  'vehicle:released',
  'vehicle:retired',
] as const;

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

export function shouldRequestColdStartRealtimeRecovery(input: {
  authContextReady: boolean;
  hasSession: boolean;
  hasSocket: boolean;
  isBootstrapping: boolean;
  isHydrated: boolean;
  networkStatus: string;
  socketStatus: string;
}) {
  if (!input.hasSession || input.hasSocket || input.authContextReady) return false;
  if (input.isBootstrapping || !input.isHydrated || input.networkStatus === 'offline') return false;

  return ['idle', 'disconnected', 'error'].includes(input.socketStatus);
}
