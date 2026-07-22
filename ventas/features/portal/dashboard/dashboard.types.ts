import type { StatusBadgeTone } from '@/src/components/ui/status-badge';
import type { CheckpointVisit, RouteEvent, RouteSessionMetrics, RouteSessionPosition } from '@/src/types/app';

export type SessionDetail = {
  events: RouteEvent[];
  metrics: RouteSessionMetrics | null;
  positions: RouteSessionPosition[];
  positionsLimit: number;
  positionsOffset: number;
  positionsTotal: number;
  visits: CheckpointVisit[];
};

export type Filters = {
  driverId: string;
  productivity: string;
  routeId: string;
  sortBy: 'time' | 'distance' | 'laps';
  status: string;
  vehicleId: string;
};

export type OperationsFilter = 'ALL' | 'RUNNING' | 'STOPPED' | 'OFF_ROUTE';

export type RouteInfo = {
  code: string;
  direction: string;
  label: string;
  status: string;
};

export type JourneyState = {
  label: string;
  tone: StatusBadgeTone;
};

export type SessionMetricsView = {
  checkpoints: number;
  distance: string;
  duration: string;
  laps: number;
  productivity: string;
  stopped: string;
};
