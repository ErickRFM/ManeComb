type PortalRealtimeEventPayload = unknown;

const portalStateBridge = {
  reset: () => undefined,
  applyRealtimeEvent: (_eventName: string, _payload?: PortalRealtimeEventPayload) => undefined,
};

export const usePortalStore = {
  getState: () => portalStateBridge,
};
