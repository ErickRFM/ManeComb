import type React from 'react';
import { Platform } from 'react-native';
import type { AppMapMarkerProps, AppMapPolylineProps, AppMapProps, AppMapRef } from './app-map.types';

const appMapModule = (Platform.OS === 'web'
  ? require('./app-map.web')
  : require('./app-map.native')) as {
  AppMap: React.ForwardRefExoticComponent<AppMapProps & React.RefAttributes<AppMapRef>>;
  AppMapMarker: React.MemoExoticComponent<(props: AppMapMarkerProps) => React.JSX.Element | null>;
  AppMapPolyline: React.MemoExoticComponent<(props: AppMapPolylineProps) => React.JSX.Element | null>;
};

export type {
  AppMapMarkerProps,
  AppMapPadding,
  AppMapPolylineProps,
  AppMapProps,
  AppMapRef,
  AppMapRegion,
  AppMapZoom,
} from './app-map.types';

export const AppMap = appMapModule.AppMap;
export const AppMapMarker = appMapModule.AppMapMarker;
export const AppMapPolyline = appMapModule.AppMapPolyline;
