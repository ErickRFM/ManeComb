import type { CSSProperties } from 'react';

export const statusFilters = ['ALL', 'RUNNING', 'PAUSED', 'FINISHED', 'CANCELLED'] as const;
export const historyPageSize = 50;
export const replayPageSize = 800;
export const maxRenderedReplayPoints = 900;
export const replaySpeeds = [1, 2, 4] as const;
export const OPERATIONS_DETAIL_WIDTH = 360;
export const OPERATIONS_UNIT_SELECTOR_WIDTH = 240;
export const driverAvatarImageStyle: CSSProperties = {
  borderRadius: 20,
  height: 40,
  objectFit: 'cover',
  width: 40,
};
export const opaqueIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
