import type * as Location from '@/src/native/location';
import type { GeoPoint } from '@/src/types/app';
import type { UserLocationIssue } from '@/src/utils/location-status';

export type LocationPermissionState = 'granted' | 'denied' | 'undetermined';

export type LiveLocationPoint = GeoPoint & {
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
};

export type LocationEngineState = {
  loading: boolean;
  permission: LocationPermissionState;
  backgroundPermission: LocationPermissionState;
  coordinates: LiveLocationPoint | null;
  lastUpdatedAt: string | null;
  servicesEnabled: boolean;
  issue: UserLocationIssue;
  retryCount: number;
};

export type LocationPosition = {
  coords: Location.LocationObjectCoords;
  timestamp?: number;
};
