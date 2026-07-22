export function needsFullCommercialReload(eventName: string) {
  return ['payment:confirmed', 'plan:active', 'subscription:updated'].includes(eventName);
}
