import type { LiveLocationPoint, LocationEngineState, LocationPermissionState } from '../types/location-engine';

export const initialLocationEngineState: LocationEngineState = {
  loading: true,
  permission: 'undetermined',
  backgroundPermission: 'undetermined',
  coordinates: null,
  lastUpdatedAt: null,
  servicesEnabled: true,
  issue: null,
  retryCount: 0,
};

export type LocationEngineAction =
  | { type: 'REQUEST_START' }
  | {
      type: 'PERMISSION_DENIED';
      permission: LocationPermissionState;
      servicesEnabled: boolean;
    }
  | {
      type: 'ISSUE';
      backgroundPermission: LocationPermissionState;
      issue: Exclude<LocationEngineState['issue'], null>;
      permission: LocationPermissionState;
      servicesEnabled: boolean;
    }
  | {
      type: 'POINT_ACCEPTED';
      backgroundPermission: LocationPermissionState;
      point: LiveLocationPoint;
      servicesEnabled: boolean;
      timestamp: string;
    }
  | {
      type: 'POINT_IGNORED';
      backgroundPermission: LocationPermissionState;
      issue: LocationEngineState['issue'];
      servicesEnabled: boolean;
    };

export function locationReducer(
  state: LocationEngineState,
  action: LocationEngineAction
): LocationEngineState {
  switch (action.type) {
    case 'REQUEST_START':
      return {
        ...state,
        loading: true,
        issue: null,
        retryCount: state.retryCount + 1,
      };
    case 'PERMISSION_DENIED':
      return {
        ...state,
        loading: false,
        permission: action.permission,
        backgroundPermission: 'undetermined',
        coordinates: null,
        lastUpdatedAt: null,
        servicesEnabled: action.servicesEnabled,
        issue: 'permission_denied',
      };
    case 'ISSUE':
      return {
        ...state,
        loading: false,
        permission: action.permission,
        backgroundPermission: action.backgroundPermission,
        coordinates: action.issue === 'permission_denied' ? null : state.coordinates,
        lastUpdatedAt: action.issue === 'permission_denied' ? null : state.lastUpdatedAt,
        servicesEnabled: action.servicesEnabled,
        issue: action.issue,
      };
    case 'POINT_ACCEPTED':
      return {
        ...state,
        loading: false,
        permission: 'granted',
        backgroundPermission: action.backgroundPermission,
        coordinates: action.point,
        lastUpdatedAt: action.timestamp,
        servicesEnabled: action.servicesEnabled,
        issue: null,
      };
    case 'POINT_IGNORED':
      return {
        ...state,
        loading: false,
        permission: 'granted',
        backgroundPermission: action.backgroundPermission,
        servicesEnabled: action.servicesEnabled,
        issue: action.issue,
      };
    default:
      return state;
  }
}
