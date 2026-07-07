import mapboxgl, { type LngLatLike, type Map as MapboxMap, type Marker as MapboxMarker } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import React, { forwardRef, memo, useContext, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
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

type MapContextValue = {
  map: MapboxMap | null;
};

const MapContext = React.createContext<MapContextValue>({ map: null });
const MAPBOX_ACCESS_TOKEN = readRuntimeValue('MAPBOX_ACCESS_TOKEN', 'MANECOMB_MAPBOX_ACCESS_TOKEN');

mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

function toLngLat(point: GeoPoint): [number, number] {
  return [point.longitude, point.latitude];
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

function toPadding(padding?: AppMapPadding) {
  return padding
    ? {
        bottom: padding.bottom,
        left: padding.left,
        right: padding.right,
        top: padding.top,
      }
    : undefined;
}

function fitBounds(map: MapboxMap, coordinates: GeoPoint[], padding?: AppMapPadding, animated = true) {
  if (coordinates.length < 2) {
    const point = coordinates[0];
    if (point) {
      map[animated ? 'easeTo' : 'jumpTo']({
        center: toLngLat(point),
        padding: toPadding(padding),
        zoom: 14,
      });
    }
    return;
  }

  const bounds = coordinates.reduce(
    (current, point) => current.extend(toLngLat(point)),
    new mapboxgl.LngLatBounds(toLngLat(coordinates[0]), toLngLat(coordinates[0]))
  );

  map.fitBounds(bounds, {
    duration: animated ? 400 : 0,
    padding: toPadding(padding),
  });
}

export const AppMap = forwardRef<AppMapRef, AppMapProps>(function AppMapView(
  { children, initialRegion, mapPadding, onPress, showsTraffic = false, style, themeMode },
  ref
) {
  const hostRef = useRef<View | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const initialRegionRef = useRef(initialRegion);
  const mapPaddingRef = useRef(mapPadding);
  const onPressRef = useRef(onPress);
  const styleURLRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = React.useState(false);
  const styleURL = showsTraffic
    ? themeMode === 'light'
      ? 'mapbox://styles/mapbox/navigation-preview-day-v4'
      : 'mapbox://styles/mapbox/navigation-preview-night-v4'
    : themeMode === 'light'
      ? 'mapbox://styles/mapbox/light-v11'
      : 'mapbox://styles/mapbox/dark-v11';

  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  useEffect(() => {
    mapPaddingRef.current = mapPadding;
  }, [mapPadding]);

  useEffect(() => {
    styleURLRef.current = styleURL;
  }, [styleURL]);

  useImperativeHandle(ref, () => ({
    animateToRegion(region, duration = 400) {
      mapRef.current?.easeTo({
        center: toLngLat(region),
        duration,
        padding: toPadding(mapPaddingRef.current),
        zoom: toZoom(region),
      });
    },
    fitToCoordinates(coordinates, options) {
      if (mapRef.current) {
        fitBounds(mapRef.current, coordinates, options?.edgePadding, options?.animated !== false);
      }
    },
  }));

  useEffect(() => {
    const host = hostRef.current as unknown as HTMLElement | null;
    const initialRegionValue = initialRegionRef.current;
    const styleURLValue = styleURLRef.current || 'mapbox://styles/mapbox/light-v11';

    if (!host || mapRef.current || !MAPBOX_ACCESS_TOKEN) {
      return;
    }

    const map = new mapboxgl.Map({
      attributionControl: false,
      center: toLngLat(initialRegionValue) as LngLatLike,
      container: host,
      interactive: true,
      logoPosition: 'bottom-left',
      style: styleURLValue,
      zoom: toZoom(initialRegionValue),
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right');
    map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.on('load', () => {
      setMapReady(true);
      if (mapPaddingRef.current) {
        map.easeTo({ padding: toPadding(mapPaddingRef.current), duration: 0 });
      }
    });
    map.on('click', (event: mapboxgl.MapMouseEvent) => {
      onPressRef.current?.({
        nativeEvent: {
          coordinate: {
            latitude: event.lngLat.lat,
            longitude: event.lngLat.lng,
          },
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setStyle(styleURL);
    }
  }, [styleURL]);

  const contextValue = useMemo(() => ({ map: mapReady ? mapRef.current : null }), [mapReady]);

  return (
    <View ref={hostRef} style={[styles.map, style]}>
      <MapContext.Provider value={contextValue}>{mapReady ? children : null}</MapContext.Provider>
    </View>
  );
});

export const AppMapPolyline = memo(function AppMapRouteLine({
  coordinates,
  id,
  strokeColor,
  strokeWidth = 3,
}: AppMapPolylineProps) {
  const { map } = useContext(MapContext);
  const sourceId = `route-source-${id || strokeColor.replace(/[^a-z0-9]/gi, '')}-${coordinates.length}`;
  const layerId = `${sourceId}-line`;

  useEffect(() => {
    if (!map || coordinates.length < 2) {
      return;
    }

    const data: GeoJSON.Feature<GeoJSON.LineString> = {
      geometry: {
        coordinates: coordinates.map(toLngLat),
        type: 'LineString',
      },
      properties: {},
      type: 'Feature',
    };

    if (map.getSource(sourceId)) {
      (map.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(data);
    } else {
      map.addSource(sourceId, { data, type: 'geojson' });
      map.addLayer({
        id: layerId,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': strokeColor,
          'line-opacity': 0.78,
          'line-width': strokeWidth,
        },
        source: sourceId,
        type: 'line',
      });
    }

    return () => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    };
  }, [coordinates, layerId, map, sourceId, strokeColor, strokeWidth]);

  return null;
});

export const AppMapMarker = memo(function AppMapPointMarker({
  coordinate,
  draggable,
  onDragEnd,
  onDragStart,
  onPress,
}: AppMapMarkerProps) {
  const { map } = useContext(MapContext);
  const markerRef = useRef<MapboxMarker | null>(null);
  const coordinateRef = useRef(coordinate);
  const onDragEndRef = useRef(onDragEnd);
  const onDragStartRef = useRef(onDragStart);
  const onPressRef = useRef(onPress);

  useEffect(() => {
    coordinateRef.current = coordinate;
  }, [coordinate]);

  useEffect(() => {
    onDragEndRef.current = onDragEnd;
  }, [onDragEnd]);

  useEffect(() => {
    onDragStartRef.current = onDragStart;
  }, [onDragStart]);

  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  useEffect(() => {
    if (!map) {
      return;
    }

    const element = document.createElement('div');
    element.style.width = '22px';
    element.style.height = '22px';
    element.style.border = '3px solid #fff';
    element.style.borderRadius = '50%';
    element.style.background = '#2563eb';
    element.style.boxSizing = 'border-box';

    const marker = new mapboxgl.Marker({ draggable, element })
      .setLngLat(toLngLat(coordinateRef.current))
      .addTo(map);

    const handleDragStart = () => onDragStartRef.current?.();
    const handleDragEnd = () => {
      const point = marker.getLngLat();
      onDragEndRef.current?.({ nativeEvent: { coordinate: { latitude: point.lat, longitude: point.lng } } });
    };
    const handleClick = () => onPressRef.current?.();

    marker.on('dragstart', handleDragStart);
    marker.on('dragend', handleDragEnd);
    element.addEventListener('click', handleClick);
    markerRef.current = marker;

    return () => {
      marker.off('dragstart', handleDragStart);
      marker.off('dragend', handleDragEnd);
      element.removeEventListener('click', handleClick);
      marker.remove();
      markerRef.current = null;
    };
  }, [draggable, map]);

  useEffect(() => {
    markerRef.current?.setLngLat(toLngLat(coordinate));
  }, [coordinate]);

  return null;
});

const styles = StyleSheet.create({
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});
