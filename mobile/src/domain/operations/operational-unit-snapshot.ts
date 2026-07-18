import type { GeoPoint, IncidentSeverity, RouteEventType } from '@/src/types/app';

export type OperationalUnitStatus =
  | 'assigned'
  | 'ready'
  | 'running'
  | 'paused'
  | 'available'
  | 'maintenance'
  | 'offline'
  | 'completed'
  | 'cancelled'
  | 'unknown';

export type OperationalGpsState = 'fresh' | 'stale' | 'missing';
export type OperationalAvailability = 'available' | 'in_use' | 'unavailable' | 'unknown';
export type OperationalAction =
  | 'center_unit'
  | 'view_route'
  | 'view_incidents'
  | 'start_journey'
  | 'pause_journey'
  | 'resume_journey'
  | 'finish_journey';

export type OperationalUnitSnapshot = Readonly<{
  id: string;
  unitNumber: string;
  plate: string | null;
  status: Readonly<{
    code: OperationalUnitStatus;
    reason: string;
  }>;
  availability: OperationalAvailability;
  gps: Readonly<{
    state: OperationalGpsState;
    ageMs: number | null;
  }>;
  location: Readonly<{
    point: GeoPoint;
    recordedAt: string;
    heading: number | null;
    speedMetersPerSecond: number | null;
  }> | null;
  route: Readonly<{
    id: string | null;
    code: string | null;
    name: string;
  }> | null;
  routeProgress: Readonly<{
    percent: number;
    remainingDistanceMeters: number;
    remainingTimeSeconds: number;
    etaAt: string | null;
    checkpointCount: number;
    currentCheckpointIndex: number;
    nextCheckpointIndex: number | null;
    isOffRoute: boolean;
    measuredAt: string;
  }> | null;
  driver: Readonly<{
    id: string | null;
    name: string;
  }> | null;
  activeJourney: Readonly<{
    id: string;
    status: 'assigned' | 'ready' | 'running' | 'paused';
    startedAt: string | null;
  }> | null;
  journeyMetrics: Readonly<{
    activeTimeSeconds: number | null;
    stoppedTimeSeconds: number | null;
    distanceMeters: number | null;
    completedLaps: number | null;
    productivityPercent: number | null;
  }>;
  incidents: readonly Readonly<{
    id: string;
    title: string;
    severity: IncidentSeverity;
    status: 'open' | 'in_progress';
    createdAt: string;
  }>[];
  lastEvent: Readonly<{
    type: RouteEventType;
    occurredAt: string;
  }> | null;
  lastUpdateAt: string | null;
  actions: readonly OperationalAction[];
}>;

