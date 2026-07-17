import mapboxgl, { type Map as MapboxMap, type Marker as MapboxMarker } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { GeoPoint, NavigationStop, RouteSessionPosition, Vehicle } from '@/src/types/app';
import { portalPalette } from '../portal-theme';

type OperationsMapProps = {
  autoFit?: boolean;
  checkpoints?: NavigationStop[];
  height?: number | string;
  onClickPoint?: (point: GeoPoint) => void;
  onVehiclePress?: (vehicle: Vehicle) => void;
  replayPath?: RouteSessionPosition[];
  replayPosition?: RouteSessionPosition | null;
  routeCoordinates?: GeoPoint[];
  selectedVehicleId?: string | null;
  showTraffic?: boolean;
  variant?: 'fleet' | 'replay';
  vehicles?: Vehicle[];
};

const MAPBOX_ACCESS_TOKEN = String(
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ||
    import.meta.env.VITE_MANECOMB_MAPBOX_ACCESS_TOKEN ||
    import.meta.env.MAPBOX_ACCESS_TOKEN ||
    ''
).trim();

mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

function toLngLat(point: GeoPoint): [number, number] {
  return [Number(point.longitude), Number(point.latitude)];
}

function isValidPoint(point?: GeoPoint | null) {
  return (
    Number.isFinite(Number(point?.latitude)) &&
    Number.isFinite(Number(point?.longitude)) &&
    Math.abs(Number(point?.latitude)) <= 90 &&
    Math.abs(Number(point?.longitude)) <= 180
  );
}

function positionToPoint(position?: RouteSessionPosition | null): GeoPoint | null {
  if (!position) return null;
  const point = { latitude: Number(position.latitude), longitude: Number(position.longitude) };
  return isValidPoint(point) ? point : null;
}

function getDriverName(vehicle: Vehicle) {
  return vehicle.driver?.name || vehicle.driverName || 'Sin conductor';
}

function createMarkerElement({ active, label, title, tone }: { active?: boolean; label: string; title?: string; tone: 'checkpoint' | 'replay' | 'vehicle' }) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  if (title) element.title = title;
  element.style.alignItems = 'center';
  element.style.background = tone === 'checkpoint' ? portalPalette.warning : tone === 'replay' ? portalPalette.accent : active ? portalPalette.accent : portalPalette.info;
  element.style.border = '2px solid #fff';
  element.style.borderRadius = tone === 'vehicle' ? '18px' : '50%';
  element.style.boxShadow = '0 10px 24px rgba(0,0,0,0.25)';
  element.style.color = '#fff';
  element.style.cursor = 'pointer';
  element.style.display = 'flex';
  element.style.fontFamily = Typography.body;
  element.style.fontSize = '11px';
  element.style.fontWeight = '900';
  element.style.height = tone === 'vehicle' ? '32px' : '28px';
  element.style.justifyContent = 'center';
  element.style.minWidth = tone === 'vehicle' ? '46px' : '28px';
  element.style.padding = tone === 'vehicle' ? '0 9px' : '0';
  return element;
}

function getVehiclePoint(vehicle: Vehicle): GeoPoint | null {
  return vehicle.locationTimestamp && isValidPoint(vehicle.location) ? vehicle.location || null : null;
}

function getBoundsPoints({
  checkpoints = [],
  replayPath = [],
  replayPosition,
  routeCoordinates = [],
  vehicles = [],
}: Pick<OperationsMapProps, 'checkpoints' | 'replayPath' | 'replayPosition' | 'routeCoordinates' | 'vehicles'>) {
  return [
    ...vehicles.map(getVehiclePoint).filter(isValidPoint),
    ...routeCoordinates.filter(isValidPoint),
    ...checkpoints.filter(isValidPoint),
    ...replayPath.map(positionToPoint).filter(isValidPoint),
    positionToPoint(replayPosition),
  ].filter(isValidPoint) as GeoPoint[];
}

function setLine(map: MapboxMap, id: string, coordinates: GeoPoint[], color: string, width: number, opacity = 0.86) {
  const sourceId = `${id}-source`;
  const layerId = `${id}-layer`;
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
    return;
  }

  map.addSource(sourceId, { data, type: 'geojson' });
  map.addLayer({
    id: layerId,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': color,
      'line-opacity': opacity,
      'line-width': width,
    },
    source: sourceId,
    type: 'line',
  });
}

function removeLine(map: MapboxMap, id: string) {
  const sourceId = `${id}-source`;
  const layerId = `${id}-layer`;
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

export function OperationsMap({
  autoFit = true,
  checkpoints = [],
  height = 410,
  onClickPoint,
  onVehiclePress,
  replayPath = [],
  replayPosition = null,
  routeCoordinates = [],
  selectedVehicleId = null,
  showTraffic = true,
  variant = 'fleet',
  vehicles = [],
}: OperationsMapProps) {
  const hostRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const onClickPointRef = useRef(onClickPoint);
  const onVehiclePressRef = useRef(onVehiclePress);
  const vehiclesRef = useRef(vehicles);
  const vehicleMarkersRef = useRef(new Map<string, MapboxMarker>());
  const checkpointMarkersRef = useRef(new Map<string, MapboxMarker>());
  const replayMarkerRef = useRef<MapboxMarker | null>(null);
  const fittedKeyRef = useRef('');
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const mapStyle = showTraffic ? 'mapbox://styles/mapbox/navigation-preview-night-v4' : 'mapbox://styles/mapbox/dark-v11';
  const boundsPoints = useMemo(
    () => getBoundsPoints({ checkpoints, replayPath, replayPosition, routeCoordinates, vehicles }),
    [checkpoints, replayPath, replayPosition, routeCoordinates, vehicles]
  );

  useEffect(() => {
    onClickPointRef.current = onClickPoint;
    onVehiclePressRef.current = onVehiclePress;
    vehiclesRef.current = vehicles;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host || mapRef.current || !MAPBOX_ACCESS_TOKEN) return;

    const initialPoint = boundsPoints[0] || { latitude: 19.4326, longitude: -99.1332 };
    const map = new mapboxgl.Map({
      attributionControl: false,
      center: toLngLat(initialPoint),
      container: host,
      interactive: true,
      logoPosition: 'bottom-left',
      style: mapStyle,
      zoom: 12,
    });
    const handleMapError = (event: mapboxgl.ErrorEvent) => {
      const status = Number((event.error as Error & { status?: number })?.status);
      if (status === 401 || status === 403) setMapUnavailable(true);
    };
    map.on('error', handleMapError);
    map.on('click', (event) => {
      onClickPointRef.current?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right');
    map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    mapRef.current = map;
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.resize()) : null;
    resizeObserver?.observe(host);
    map.once('load', () => {
      setMapUnavailable(false);
      map.resize();
    });

    return () => {
      vehicleMarkersRef.current.forEach((marker) => marker.remove());
      checkpointMarkersRef.current.forEach((marker) => marker.remove());
      replayMarkerRef.current?.remove();
      map.off('error', handleMapError);
      resizeObserver?.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(mapStyle);
  }, [mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const syncLines = () => {
      if (routeCoordinates.length >= 2) setLine(map, 'operations-route', routeCoordinates, portalPalette.accent, 4);
      else removeLine(map, 'operations-route');
      const replayCoordinates = replayPath.map(positionToPoint).filter(isValidPoint) as GeoPoint[];
      if (replayCoordinates.length >= 2) setLine(map, 'operations-replay', replayCoordinates, portalPalette.info, 3, 0.72);
      else removeLine(map, 'operations-replay');
    };

    if (map.isStyleLoaded()) {
      syncLines();
      return undefined;
    }
    map.once('load', syncLines);
    return () => undefined;
  }, [replayPath, routeCoordinates]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const nextIds = new Set<string>();

    vehicles.forEach((vehicle) => {
      const point = getVehiclePoint(vehicle);
      if (!point) return;
      nextIds.add(vehicle.id);
      let marker = vehicleMarkersRef.current.get(vehicle.id);
      if (!marker) {
        const element = createMarkerElement({
          active: vehicle.id === selectedVehicleId,
          label: vehicle.code,
          title: `${vehicle.code} · ${getDriverName(vehicle)}`,
          tone: 'vehicle',
        });
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          const latest = vehiclesRef.current.find((item) => item.id === vehicle.id) || vehicle;
          onVehiclePressRef.current?.(latest);
        });
        marker = new mapboxgl.Marker({ element }).setLngLat(toLngLat(point)).addTo(map);
        vehicleMarkersRef.current.set(vehicle.id, marker);
      } else {
        marker.setLngLat(toLngLat(point));
        const element = marker.getElement();
        element.textContent = vehicle.code;
        element.title = `${vehicle.code} · ${getDriverName(vehicle)}`;
        element.style.background = vehicle.id === selectedVehicleId ? portalPalette.accent : portalPalette.info;
      }
    });

    vehicleMarkersRef.current.forEach((marker, vehicleId) => {
      if (!nextIds.has(vehicleId)) {
        marker.remove();
        vehicleMarkersRef.current.delete(vehicleId);
      }
    });
  }, [selectedVehicleId, vehicles]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const nextIds = new Set<string>();

    checkpoints.forEach((checkpoint, index) => {
      if (!isValidPoint(checkpoint)) return;
      const checkpointId = checkpoint.id || `checkpoint-${index}`;
      nextIds.add(checkpointId);
      let marker = checkpointMarkersRef.current.get(checkpointId);
      if (!marker) {
        marker = new mapboxgl.Marker({
          element: createMarkerElement({ label: String(checkpoint.order + 1 || index + 1), tone: 'checkpoint' }),
        }).setLngLat(toLngLat(checkpoint)).addTo(map);
        checkpointMarkersRef.current.set(checkpointId, marker);
      } else {
        marker.setLngLat(toLngLat(checkpoint));
      }
    });

    checkpointMarkersRef.current.forEach((marker, checkpointId) => {
      if (!nextIds.has(checkpointId)) {
        marker.remove();
        checkpointMarkersRef.current.delete(checkpointId);
      }
    });
  }, [checkpoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const point = positionToPoint(replayPosition);
    if (!point) {
      replayMarkerRef.current?.remove();
      replayMarkerRef.current = null;
      return;
    }
    if (!replayMarkerRef.current) {
      replayMarkerRef.current = new mapboxgl.Marker({
        element: createMarkerElement({ label: '▶', tone: 'replay' }),
        rotation: Number(replayPosition?.heading) || 0,
      }).setLngLat(toLngLat(point)).addTo(map);
      return;
    }
    replayMarkerRef.current.setLngLat(toLngLat(point));
    replayMarkerRef.current.setRotation(Number(replayPosition?.heading) || 0);
  }, [replayPosition]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !autoFit || !boundsPoints.length) return;
    const fitKey = boundsPoints.map((point) => `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`).join('|');
    if (fitKey === fittedKeyRef.current) return;
    fittedKeyRef.current = fitKey;

    if (boundsPoints.length === 1) {
      map.easeTo({ center: toLngLat(boundsPoints[0]), duration: 400, zoom: 14 });
      return;
    }

    const bounds = boundsPoints.reduce(
      (current, point) => current.extend(toLngLat(point)),
      new mapboxgl.LngLatBounds(toLngLat(boundsPoints[0]), toLngLat(boundsPoints[0]))
    );
    map.fitBounds(bounds, { duration: 450, padding: 52 });
  }, [autoFit, boundsPoints]);

  if (!MAPBOX_ACCESS_TOKEN || mapUnavailable) {
    const locatedVehicles = vehicles.filter((vehicle) => Boolean(getVehiclePoint(vehicle)));
    const currentReplayPoint = positionToPoint(replayPosition) || positionToPoint(replayPath[replayPath.length - 1]);
    const isReplay = variant === 'replay' || replayPath.length > 0 || Boolean(replayPosition);
    // Distinguir mapa vacio por token ausente vs mapa que fallo en tiempo de ejecucion.
    const reason = mapUnavailable
      ? 'No fue posible cargar el mapa. Mostramos las ubicaciones registradas.'
      : 'Vista geografica no disponible en este entorno.';
    const title = isReplay ? 'Recorrido de la jornada' : 'Seguimiento por unidad';
    const icon: keyof typeof MaterialCommunityIcons.glyphMap =
      locatedVehicles.length || currentReplayPoint ? 'map-marker-radius-outline' : isReplay ? 'map-marker-path' : 'map-marker-off-outline';
    const message = locatedVehicles.length
      ? reason
      : currentReplayPoint
        ? `Ultima posicion registrada: ${currentReplayPoint.latitude.toFixed(5)}, ${currentReplayPoint.longitude.toFixed(5)}.`
        : isReplay
          ? 'Esta jornada no tiene recorrido GPS guardado.'
          : 'Las unidades apareceran aqui cuando reporten una ubicacion.';
    return (
      <View style={[styles.fallback, { height, minHeight: typeof height === 'number' ? height : 460 }]}>
        <View style={styles.fallbackHeader}>
          <View style={styles.fallbackIcon}>
            <MaterialCommunityIcons name={icon} size={20} color={portalPalette.accent} />
          </View>
          <View style={styles.fallbackHeaderText}>
            <Text style={styles.fallbackTitle}>{title}</Text>
            <Text style={styles.fallbackText}>{message}</Text>
          </View>
        </View>
        {locatedVehicles.length ? (
          <View style={styles.fallbackList}>
            {locatedVehicles.map((vehicle) => {
              const point = getVehiclePoint(vehicle);
              const active = vehicle.id === selectedVehicleId;
              return (
                <Pressable
                  key={vehicle.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver ${vehicle.code} de ${getDriverName(vehicle)}`}
                  onPress={() => onVehiclePress?.(vehicle)}
                  style={[styles.fallbackUnit, active ? styles.fallbackUnitActive : undefined]}>
                  <Text style={[styles.fallbackUnitCode, active ? styles.fallbackUnitTextActive : undefined]}>
                    {vehicle.code} · {getDriverName(vehicle)}
                  </Text>
                  <Text style={[styles.fallbackUnitCoords, active ? styles.fallbackUnitTextActive : undefined]}>
                    {Number(point?.latitude).toFixed(5)}, {Number(point?.longitude).toFixed(5)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    );
  }

  return <View ref={hostRef as never} style={[styles.map, { height, minHeight: typeof height === 'number' ? height : 460 }]} />;
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'flex-start',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    gap: 8,
    justifyContent: 'flex-start',
    padding: 14,
  },
  fallbackHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  fallbackHeaderText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  fallbackIcon: {
    alignItems: 'center',
    backgroundColor: portalPalette.surface,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
    flexShrink: 0,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  fallbackText: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'left',
  },
  fallbackTitle: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 16,
    fontWeight: '900',
  },
  fallbackList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    maxWidth: 520,
    width: '100%',
  },
  fallbackUnit: {
    backgroundColor: portalPalette.surface,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
    flexBasis: 180,
    flexGrow: 1,
    gap: 2,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fallbackUnitActive: {
    backgroundColor: portalPalette.infoSoft,
    borderColor: portalPalette.info,
  },
  fallbackUnitCode: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
  },
  fallbackUnitCoords: {
    color: portalPalette.muted,
    fontFamily: Typography.mono,
    fontSize: 11,
  },
  fallbackUnitTextActive: {
    color: portalPalette.info,
  },
  map: {
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
});
