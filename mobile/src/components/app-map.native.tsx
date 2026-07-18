import Mapbox from '@rnmapbox/maps';
import Config from 'react-native-config';
import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type {
  AppMapMarkerProps,
  AppMapPadding,
  AppMapPolylineProps,
  AppMapProps,
  AppMapRef,
  AppMapRegion,
} from './app-map.types';
import { readRuntimeValue } from '@/src/config/api_config';
import type { GeoPoint } from '@/src/types/app';

const MAPBOX_ACCESS_TOKEN =
  readRuntimeValue('MAPBOX_ACCESS_TOKEN', 'MANECOMB_MAPBOX_ACCESS_TOKEN') ||
  Config.MAPBOX_ACCESS_TOKEN ||
  '';

if (MAPBOX_ACCESS_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
}

function toCoordinate(point: GeoPoint): [number, number] {
  return [point.longitude, point.latitude];
}

function toPoint(coordinate: number[] | undefined): GeoPoint {
  return {
    latitude: Number(coordinate?.[1]) || 0,
    longitude: Number(coordinate?.[0]) || 0,
  };
}

function toZoom(region: AppMapRegion) {
  const span = Math.max(region.latitudeDelta || 0.03, region.longitudeDelta || 0.03);

  if (span <= 0.016) {
    return 15.5;
  }

  if (span <= 0.035) {
    return 14;
  }

  return 12;
}

function toCameraPadding(padding?: AppMapPadding) {
  if (!padding) {
    return undefined;
  }

  return {
    paddingBottom: padding.bottom,
    paddingLeft: padding.left,
    paddingRight: padding.right,
    paddingTop: padding.top,
  };
}

function getBounds(points: GeoPoint[]) {
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const north = Math.max(...latitudes);
  const south = Math.min(...latitudes);
  const east = Math.max(...longitudes);
  const west = Math.min(...longitudes);

  return {
    ne: [east, north] as [number, number],
    sw: [west, south] as [number, number],
  };
}

type PendingCameraAction =
  | { type: 'region'; region: AppMapRegion; duration: number }
  | {
      type: 'fit';
      coordinates: GeoPoint[];
      options?: { animated?: boolean; edgePadding?: AppMapPadding };
    };

export const AppMap = forwardRef<AppMapRef, AppMapProps>(function AppMapView(
  {
    children,
    compassEnabled = true,
    compassPosition,
    initialRegion,
    mapPadding,
    onPress,
    scaleBarPosition,
    scaleEnabled = true,
    showsTraffic = false,
    style,
    themeMode,
  },
  ref
) {
  const cameraRef = useRef<Mapbox.Camera>(null);
  const mapReadyRef = useRef(false);
  const mapPaddingRef = useRef(mapPadding);
  const initialRegionRef = useRef(initialRegion);
  const pendingCameraActionRef = useRef<PendingCameraAction | null>(null);
  initialRegionRef.current = initialRegion;
  const styleURL = showsTraffic
    ? themeMode === 'light'
      ? Mapbox.StyleURL.TrafficDay
      : Mapbox.StyleURL.TrafficNight
    : themeMode === 'light'
      ? Mapbox.StyleURL.Light
      : Mapbox.StyleURL.Dark;

  useEffect(() => {
    mapPaddingRef.current = mapPadding;

    if (!mapReadyRef.current) {
      return;
    }

    cameraRef.current?.setCamera({
      animationDuration: 0,
      animationMode: 'none',
      padding: toCameraPadding(mapPadding),
    });
  }, [mapPadding]);

  const executeCameraAction = (action: PendingCameraAction) => {
    if (action.type === 'region') {
      cameraRef.current?.setCamera({
        animationDuration: action.duration,
        animationMode: action.duration > 0 ? 'easeTo' : 'none',
        centerCoordinate: toCoordinate(action.region),
        padding: toCameraPadding(mapPaddingRef.current),
        zoomLevel: toZoom(action.region),
      });
      return;
    }

    if (action.coordinates.length < 2) {
      const point = action.coordinates[0];
      if (point) {
        cameraRef.current?.setCamera({
          animationDuration: action.options?.animated === false ? 0 : 400,
          animationMode: action.options?.animated === false ? 'none' : 'easeTo',
          centerCoordinate: toCoordinate(point),
          padding: toCameraPadding(action.options?.edgePadding),
          zoomLevel: 14,
        });
      }
      return;
    }

    const bounds = getBounds(action.coordinates);
    cameraRef.current?.fitBounds(
      bounds.ne,
      bounds.sw,
      action.options?.edgePadding
        ? [
            action.options.edgePadding.top,
            action.options.edgePadding.right,
            action.options.edgePadding.bottom,
            action.options.edgePadding.left,
          ]
        : undefined,
      action.options?.animated === false ? 0 : 400
    );
  };

  const runOrQueueCameraAction = (action: PendingCameraAction) => {
    if (!mapReadyRef.current) {
      pendingCameraActionRef.current = action;
      return;
    }

    executeCameraAction(action);
  };

  useImperativeHandle(ref, () => ({
    animateToRegion(region, duration = 400) {
      runOrQueueCameraAction({ type: 'region', region, duration });
    },
    fitToCoordinates(coordinates, options) {
      runOrQueueCameraAction({ type: 'fit', coordinates, options });
    },
  }));

  return (
    <Mapbox.MapView
      attributionEnabled={false}
      compassEnabled={compassEnabled}
      compassFadeWhenNorth
      compassPosition={compassPosition}
      logoEnabled={false}
      onDidFinishLoadingMap={() => {
        mapReadyRef.current = true;
        const pendingAction = pendingCameraActionRef.current;
        pendingCameraActionRef.current = null;
        executeCameraAction(
          pendingAction || {
            type: 'region',
            region: initialRegionRef.current,
            duration: 0,
          }
        );
      }}
      onWillStartLoadingMap={() => {
        mapReadyRef.current = false;
      }}
      onPress={(feature) => {
        onPress?.({ nativeEvent: { coordinate: toPoint(feature.geometry?.coordinates) } });
      }}
      scaleBarEnabled={scaleEnabled}
      scaleBarPosition={scaleBarPosition}
      scaleBarUnits="metric"
      surfaceView={false}
      style={style}
      styleURL={styleURL}>
      <Mapbox.Camera
        ref={cameraRef}
        defaultSettings={{
          centerCoordinate: toCoordinate(initialRegion),
          padding: toCameraPadding(mapPadding),
          zoomLevel: toZoom(initialRegion),
        }}
      />
      {children}
    </Mapbox.MapView>
  );
});

const lineLayerStyle = {
  lineCap: 'round' as const,
  lineColor: '#2563EB',
  lineJoin: 'round' as const,
  lineOpacity: 0.78,
  lineWidth: 3,
};

export const AppMapPolyline = memo(function AppMapRouteLine({
  coordinates,
  id,
  lineBlur = 0,
  strokeOpacity = 0.86,
  strokeColor,
  strokeWidth = 3,
}: AppMapPolylineProps) {
  const shape = useMemo<GeoJSON.Feature<GeoJSON.LineString>>(
    () => ({
      geometry: {
        coordinates: coordinates.map(toCoordinate),
        type: 'LineString',
      },
      properties: {},
      type: 'Feature',
    }),
    [coordinates]
  );

  if (coordinates.length < 2) {
    return null;
  }

  const sourceId = `route-source-${id || strokeColor.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <Mapbox.ShapeSource id={sourceId} shape={shape}>
      <Mapbox.LineLayer
        id={`${sourceId}-line`}
        style={{
          ...lineLayerStyle,
          lineBlur,
          lineColor: strokeColor,
          lineOpacity: strokeOpacity,
          lineWidth: strokeWidth,
        }}
      />
    </Mapbox.ShapeSource>
  );
});

export const AppMapMarker = memo(function AppMapPointMarker({
  children,
  coordinate,
  draggable,
  id,
  onDragEnd,
  onDragStart,
  onPress,
}: AppMapMarkerProps) {
  if (!coordinate || !Number.isFinite(coordinate.latitude) || !Number.isFinite(coordinate.longitude)) {
    return null;
  }

  const annotationId = id || `marker-${coordinate.latitude}-${coordinate.longitude}`;

  return (
    <Mapbox.PointAnnotation
      coordinate={toCoordinate(coordinate)}
      draggable={draggable}
      id={annotationId}
      onDragEnd={(feature) => {
        onDragEnd?.({ nativeEvent: { coordinate: toPoint(feature.geometry?.coordinates) } });
      }}
      onDragStart={onDragStart}
      onSelected={onPress}>
      <View style={styles.markerHost}>{children}</View>
    </Mapbox.PointAnnotation>
  );
});

const styles = StyleSheet.create({
  markerHost: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
