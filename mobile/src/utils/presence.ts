export type PresenceStatus = 'online' | 'offline' | 'unknown';
export type PresenceMap = Record<string, 'online' | 'offline'>;

export function getPresenceStatus(presenceByUser: PresenceMap, userId?: string | null): PresenceStatus {
  if (!userId) return 'unknown';
  return presenceByUser[userId] || 'unknown';
}

export function buildPresenceSnapshot(
  knownUserIds: Iterable<string>,
  onlineUserIds: Iterable<string>
): PresenceMap {
  const online = new Set(Array.from(onlineUserIds).filter(Boolean));
  return Object.fromEntries(
    Array.from(new Set(Array.from(knownUserIds).filter(Boolean))).map((userId) => [
      userId,
      online.has(userId) ? 'online' : 'offline',
    ])
  );
}

export function markAllPresenceUnknown(): PresenceMap {
  return {};
}

export function getPresencePresentation(status: PresenceStatus) {
  if (status === 'online') return { label: 'En línea', tone: 'positive' as const };
  if (status === 'offline') return { label: 'Sin conexión', tone: 'neutral' as const };
  return { label: 'Sin confirmar', tone: 'neutral' as const };
}
