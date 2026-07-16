import type { AppMapPadding } from '@/src/components/app-map';
import type { GeoPoint } from '@/src/types/app';
import type { getLocationStatus } from '@/src/utils/location-status';

export type SelectorRole = 'origin' | 'destination' | 'stop';
export type SelectorPointRole = Exclude<SelectorRole, 'stop'>;
export type MapFocusZoom = 'close' | 'vehicle' | 'overview';

export type MapSelectorParams = {
  vehicleId?: string;
  follow?: string;
  focusLatitude?: string;
  focusLongitude?: string;
  point?: SelectorRole;
  returnTo?: string;
  returnFilter?: string;
  historyScrollY?: string;
  routeNameDraft?: string;
  originLatitude?: string;
  originLongitude?: string;
  originAddress?: string;
  originLabel?: string;
  destinationLatitude?: string;
  destinationLongitude?: string;
  destinationAddress?: string;
  destinationLabel?: string;
  stops?: string;
};

export type LocationStatusSnapshot = ReturnType<typeof getLocationStatus>;

export type FitRouteOptions = {
  coordinates: GeoPoint[];
  edgePadding: AppMapPadding;
};
