import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { GeoPoint } from '@/src/types/app';

export type AppMapZoom = 'close' | 'vehicle' | 'overview';

export type AppMapPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type AppMapRegion = GeoPoint & {
  latitudeDelta?: number;
  longitudeDelta?: number;
};

export type AppMapRef = {
  animateToRegion: (region: AppMapRegion, duration?: number) => void;
  fitToCoordinates: (
    coordinates: GeoPoint[],
    options?: {
      animated?: boolean;
      edgePadding?: AppMapPadding;
    }
  ) => void;
};

export type AppMapProps = {
  children?: ReactNode;
  compassEnabled?: boolean;
  initialRegion: AppMapRegion;
  mapPadding?: AppMapPadding;
  onPress?: (event: { nativeEvent: { coordinate?: GeoPoint } }) => void;
  scaleEnabled?: boolean;
  showsTraffic?: boolean;
  style?: StyleProp<ViewStyle>;
  themeMode: 'light' | 'dark';
};

export type AppMapMarkerProps = {
  children: ReactNode;
  coordinate: GeoPoint;
  draggable?: boolean;
  id?: string;
  onDragEnd?: (event: { nativeEvent: { coordinate: GeoPoint } }) => void;
  onDragStart?: () => void;
  onPress?: () => void;
};

export type AppMapPolylineProps = {
  coordinates: GeoPoint[];
  id?: string;
  lineBlur?: number;
  strokeOpacity?: number;
  strokeColor: string;
  strokeWidth?: number;
};
