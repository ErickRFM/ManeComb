import mapboxgl, { type Map as MapboxMap, type Marker as MapboxMarker } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, DesignSystem, Typography } from '@/constants/theme';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { GeoPoint, NavigationStop, RouteSessionPosition, Vehicle } from '@/src/types/app';
import { formatGpsAge, type OperationalUnitSnapshot } from '@shared/operational-contract';
import { portalPalette } from '../portal-theme';
import { RouteGeometryThumbnail } from './route-geometry-thumbnail';
import { buildOperationalVehicleView } from '../utils/operational-vehicle-view.js';

type OperationsMapProps = {
  autoFit?: boolean;
  checkpoints?: NavigationStop[];
  height?: number | string;
  mapMode?: 'operational' | 'satellite' | 'traffic';
  onClickPoint?: (point: GeoPoint) => void;
  onVehiclePress?: (vehicle: Vehicle) => void;
  operationalUnits?: OperationalUnitSnapshot[];
  replayPath?: RouteSessionPosition[];
  replayPosition?: RouteSessionPosition | null;
  routeCoordinates?: GeoPoint[];
  selectedVehicleId?: string | null;
  showTraffic?: boolean;
  variant?: 'fleet' | 'replay';
  vehicles?: Vehicle[];
  vehicleRoutes?: Array<{ vehicleId: string; coordinates: GeoPoint[]; color?: string }>;
  editablePoints?: Array<{ id: string; kind: 'origin' | 'checkpoint' | 'destination'; point: GeoPoint }>;
  selectedEditablePointId?: string | null;
  onEditablePointChange?: (id: string, point: GeoPoint) => void;
  onEditablePointSelect?: (id: string) => void;
  highlightedSegment?: GeoPoint[];
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

// Number(null), Number(''), Number([]) y Number(false) valen 0: sin esta verificacion
// una unidad sin GPS se colaba como una coordenada "valida" en (0, 0).
function toFiniteCoordinate(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toValidPoint(point?: Partial<GeoPoint> | null): GeoPoint | null {
  const latitude = toFiniteCoordinate(point?.latitude);
  const longitude = toFiniteCoordinate(point?.longitude);
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function isValidPoint(point?: GeoPoint | null) {
  return toValidPoint(point) !== null;
}

function toValidPoints(points: readonly (GeoPoint | null | undefined)[]): GeoPoint[] {
  return points.map(toValidPoint).filter((point): point is GeoPoint => point !== null);
}

function positionToPoint(position?: RouteSessionPosition | null): GeoPoint | null {
  return toValidPoint(position as Partial<GeoPoint> | null | undefined);
}

function getDriverName(unit?: OperationalUnitSnapshot) {
  return unit?.driver?.name || 'Sin conductor';
}

function getMarkerTone(vehicle: Vehicle, unit?: OperationalUnitSnapshot, selectedVehicleId?: string | null): { background: string; border: string } {
  if (vehicle.id === selectedVehicleId) return { background: portalPalette.accent, border: '#fff' };
  if (unit?.route?.isOffRoute) return { background: '#d32f2f', border: '#fff' };
  // Solo un enlace vivo sostiene un color operativo. Desde `delayed` la ultima
  // posicion permanece visible, pero se presenta neutra para no fingir salud.
  if (unit?.gps.connectionState !== 'live') return { background: '#64748b', border: '#fff' };
  if (vehicle.status === 'maintenance' || vehicle.status === 'offline') return { background: '#475569', border: '#fff' };
  if (unit?.operationalState === 'stopped') return { background: portalPalette.warning, border: '#fff' };
  return { background: portalPalette.success, border: '#fff' };
}

/**
 * Sufijo de telemetria del marcador. Presenta la taxonomia canonica; no la
 * recalcula. `never_reported` no lleva marcador con posicion, pero el sufijo se
 * mantiene exhaustivo por si el vehiculo llega sin coordenada resuelta.
 */
function getMarkerGpsSuffix(unit?: OperationalUnitSnapshot) {
  const connectionState = unit?.gps.connectionState || 'never_reported';
  if (connectionState === 'live') return '';
  if (connectionState === 'never_reported') return ' · esperando primera ubicación';
  const age = formatGpsAge(unit?.gps.ageSeconds ?? null);
  return age ? ` · sin señal, última posición ${age}` : ' · sin señal, última posición';
}

function createMarkerElement({ background, border, label, title, shape }: { background: string; border: string; label: string; title?: string; shape: 'pill' | 'circle' }) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `operations-map-marker operations-map-marker--${shape}`;
  element.textContent = label;
  element.setAttribute('aria-label', title || label);
  if (title) element.title = title;
  element.style.alignItems = 'center';
  element.style.background = background;
  element.style.border = `2px solid ${border}`;
  element.style.borderRadius = shape === 'pill' ? '18px' : '50%';
  element.style.boxShadow = '0 10px 24px rgba(0,0,0,0.25)';
  element.style.color = '#fff';
  element.style.cursor = 'pointer';
  element.style.display = 'flex';
  element.style.fontFamily = Typography.body;
  element.style.fontSize = '11px';
  element.style.fontWeight = '900';
  element.style.height = shape === 'pill' ? '32px' : '28px';
  element.style.justifyContent = 'center';
  element.style.minWidth = shape === 'pill' ? '46px' : '28px';
  element.style.padding = shape === 'pill' ? '0 9px' : '0';
  return element;
}

function getVehiclePoint(unit?: OperationalUnitSnapshot): GeoPoint | null {
  return toValidPoint(unit?.gps.lat == null || unit.gps.lng == null
    ? null
    : { latitude: unit.gps.lat, longitude: unit.gps.lng });
}

function getBoundsPoints({
  checkpoints = [],
  replayPath = [],
  replayPosition,
  routeCoordinates = [],
  operationalUnits = [],
}: Pick<OperationsMapProps, 'checkpoints' | 'replayPath' | 'replayPosition' | 'routeCoordinates' | 'operationalUnits'>) {
  return toValidPoints([
    ...operationalUnits.map(getVehiclePoint),
    ...routeCoordinates,
    ...checkpoints,
    ...replayPath.map(positionToPoint),
    positionToPoint(replayPosition),
  ]);
}

const FIT_PADDING = {
  top: 84,
  right: 64,
  bottom: 132,
  left: 64,
};
const MIN_OPERATIONAL_AUTO_ZOOM = 8.5;
const SINGLE_VEHICLE_AUTO_ZOOM = 15;
const MAX_AUTO_FIT_ZOOM = 15;
// Por debajo de esto el canvas todavia no tiene layout util: reintentamos en vez de encuadrar.
const MIN_FIT_VIEWPORT = 48;
// mapbox-gl 2.15 `_cameraForBounds` calcula scaleX/scaleY como
// (canvas - padding) / tamanoBounds y NO valida el signo (la guarda
// `if (scaleX < 0 || scaleY < 0) return` del antiguo `_cameraForBoxAndBearing`
// se perdio). Con padding >= canvas el resultado es negativo, `scaleZoom()`
// hace log2 de un negativo -> NaN, y el centro termina en
// `new LngLat(NaN, NaN)` -> "Invalid LngLat object: (NaN, NaN)".
const MAX_PADDING_RATIO = 0.6;

function scalePaddingPair(start: number, end: number, size: number): [number, number] {
  const total = start + end;
  if (total <= 0) return [0, 0];
  const budget = size * MAX_PADDING_RATIO;
  if (total <= budget) return [start, end];
  const factor = budget / total;
  return [start * factor, end * factor];
}

function resolveFitPadding(map: MapboxMap) {
  const canvas = map.getCanvas();
  const container = map.getContainer();
  const width = canvas?.clientWidth || container?.clientWidth || 0;
  const height = canvas?.clientHeight || container?.clientHeight || 0;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < MIN_FIT_VIEWPORT || height < MIN_FIT_VIEWPORT) return null;
  const [left, right] = scalePaddingPair(FIT_PADDING.left, FIT_PADDING.right, width);
  const [top, bottom] = scalePaddingPair(FIT_PADDING.top, FIT_PADDING.bottom, height);
  return { bottom, left, right, top };
}

const cameraEasing = (value: number) => 1 - Math.pow(1 - value, 3);

// Encuadre inicial por geolocalizacion del navegador, solo cuando no hay ninguna
// unidad posicionable. Constantes de logica (no estilos): sin marcador, sin envio
// al backend, sin persistencia mas alla de esta sesion de pantalla.
const GEO_GRACE_MS = 800; // margen para que lleguen las unidades antes de pedir permiso
const GEO_TIMEOUT_MS = 8000;
const GEO_MAX_AGE_MS = 300000; // una posicion de hasta 5 min basta para centrar ciudad
const GEO_CITY_ZOOM = 11; // nivel ciudad/region

const FLEET_CLUSTER_THRESHOLD = 30;
const FLEET_CLUSTER_SOURCE_ID = 'operations-fleet-cluster-source';
const FLEET_CLUSTER_LAYER_ID = 'operations-fleet-clusters';
const FLEET_CLUSTER_COUNT_LAYER_ID = 'operations-fleet-cluster-count';
const FLEET_POINT_LAYER_ID = 'operations-fleet-points';
const FLEET_POINT_LABEL_LAYER_ID = 'operations-fleet-point-labels';

function removeFleetClusterLayers(map: MapboxMap) {
  [
    FLEET_POINT_LABEL_LAYER_ID,
    FLEET_POINT_LAYER_ID,
    FLEET_CLUSTER_COUNT_LAYER_ID,
    FLEET_CLUSTER_LAYER_ID,
  ].forEach((layerId) => {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  });
  if (map.getSource(FLEET_CLUSTER_SOURCE_ID)) map.removeSource(FLEET_CLUSTER_SOURCE_ID);
}

function syncFleetClusterLayers(
  map: MapboxMap,
  data: GeoJSON.FeatureCollection<GeoJSON.Point>
) {
  const source = map.getSource(FLEET_CLUSTER_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
  } else {
    map.addSource(FLEET_CLUSTER_SOURCE_ID, {
      type: 'geojson',
      data,
      cluster: true,
      clusterMaxZoom: 13,
      clusterRadius: 48,
    });
  }

  if (!map.getLayer(FLEET_CLUSTER_LAYER_ID)) {
    map.addLayer({
      id: FLEET_CLUSTER_LAYER_ID,
      type: 'circle',
      source: FLEET_CLUSTER_SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': 'rgba(7, 14, 27, 0.94)',
        'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 50, 27] as any,
        'circle-stroke-color': portalPalette.accent,
        'circle-stroke-width': 2,
      },
    });
  }

  if (!map.getLayer(FLEET_CLUSTER_COUNT_LAYER_ID)) {
    map.addLayer({
      id: FLEET_CLUSTER_COUNT_LAYER_ID,
      type: 'symbol',
      source: FLEET_CLUSTER_SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'] as any,
        'text-size': 12,
      },
      paint: {
        'text-color': '#FFFFFF',
      },
    });
  }

  if (!map.getLayer(FLEET_POINT_LAYER_ID)) {
    map.addLayer({
      id: FLEET_POINT_LAYER_ID,
      type: 'circle',
      source: FLEET_CLUSTER_SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ['get', 'tone'] as any,
        'circle-radius': 17,
        'circle-stroke-color': ['case', ['==', ['get', 'selected'], 1], '#FFFFFF', 'rgba(255,255,255,.82)'] as any,
        'circle-stroke-width': ['case', ['==', ['get', 'selected'], 1], 3, 2] as any,
      },
    });
  }

  if (!map.getLayer(FLEET_POINT_LABEL_LAYER_ID)) {
    map.addLayer({
      id: FLEET_POINT_LABEL_LAYER_ID,
      type: 'symbol',
      source: FLEET_CLUSTER_SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'text-field': ['get', 'code'] as any,
        'text-size': 10,
        'text-offset': [0, 0],
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#FFFFFF',
        'text-halo-color': 'rgba(7,14,27,.78)',
        'text-halo-width': 1,
      },
    });
  }
}

// Devuelve false cuando el encuadre no se pudo aplicar todavia (canvas sin layout),
// para que quien llama reintente en lugar de marcar el encuadre como hecho.
function applyCamera(
  map: MapboxMap,
  points: GeoPoint[],
  policy: { minZoom?: number; singleZoom?: number } = {}
): boolean {
  const valid = toValidPoints(points);
  if (!valid.length) return true;

  const minZoom = Math.max(0, Number(policy.minZoom) || 0);
  const singleZoom = Math.min(MAX_AUTO_FIT_ZOOM, Math.max(minZoom, Number(policy.singleZoom) || 14));
  const centerOn = (point: GeoPoint) => {
    map.easeTo({ center: toLngLat(point), duration: 500, easing: cameraEasing, zoom: singleZoom });
  };

  try {
    if (valid.length === 1) {
      centerOn(valid[0]);
      return true;
    }

    const padding = resolveFitPadding(map);
    if (!padding) return false;

    const bounds = valid.reduce(
      (current, point) => current.extend(toLngLat(point)),
      new mapboxgl.LngLatBounds(toLngLat(valid[0]), toLngLat(valid[0]))
    );
    // Bounds degenerado (todas las unidades en el mismo punto): fitBounds divide
    // entre un tamano 0. Centrar es equivalente y no depende de esa division.
    if (bounds.getWest() === bounds.getEast() && bounds.getSouth() === bounds.getNorth()) {
      centerOn(valid[0]);
      return true;
    }

    const camera = map.cameraForBounds(bounds, { maxZoom: MAX_AUTO_FIT_ZOOM, padding });
    const cameraZoom = Number(camera?.zoom);
    if (camera?.center && Number.isFinite(cameraZoom)) {
      // El centro operativo no debe arrancar a escala continental por un outlier
      // GPS. Se conserva el centro calculado por Mapbox, pero el auto-encuadre se
      // limita a una escala regional. El usuario siempre puede alejar manualmente.
      map.easeTo({
        center: camera.center,
        duration: 550,
        easing: cameraEasing,
        zoom: Math.max(minZoom, Math.min(MAX_AUTO_FIT_ZOOM, cameraZoom)),
      });
      return true;
    }

    map.fitBounds(bounds, { duration: 550, easing: cameraEasing, maxZoom: MAX_AUTO_FIT_ZOOM, padding });
    return true;
  } catch (error) {
    // Blindaje: un fallo de camara degrada a mapa sin encuadre, nunca tumba la pantalla.
    console.warn('[OperationsMap] no se pudo aplicar el encuadre', error);
    try {
      centerOn(valid[0]);
    } catch {
      // Ignorado a proposito: el mapa se queda en su vista actual.
    }
    return true;
  }
}

function setLine(map: MapboxMap, id: string, coordinates: GeoPoint[], color: string, width: number, opacity = 0.86) {
  const sourceId = `${id}-source`;
  const layerId = `${id}-layer`;
  const glowSourceId = `${id}-glow-source`;
  const glowLayerId = `${id}-glow-layer`;
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
    if (map.getLayer(glowLayerId)) {
      map.setPaintProperty(glowLayerId, 'line-color', color);
      map.setPaintProperty(glowLayerId, 'line-opacity', opacity * 0.3);
      map.setPaintProperty(glowLayerId, 'line-width', width + 6);
    }
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'line-color', color);
      map.setPaintProperty(layerId, 'line-opacity', opacity);
      map.setPaintProperty(layerId, 'line-width', width);
    }
    return;
  }

  map.addSource(sourceId, { data, type: 'geojson' });
  map.addLayer({
    id: glowLayerId,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': color,
      'line-opacity': opacity * 0.3,
      'line-width': width + 6,
    },
    source: sourceId,
    type: 'line',
  });
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
  const glowSourceId = `${id}-glow-source`;
  const glowLayerId = `${id}-glow-layer`;
  if (map.getLayer(glowLayerId)) map.removeLayer(glowLayerId);
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getSource(glowSourceId)) map.removeSource(glowSourceId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

export const OperationsMap = React.memo(function OperationsMap({
  autoFit = true,
  checkpoints = [],
  height = 410,
  mapMode = 'operational',
  onClickPoint,
  onVehiclePress,
  operationalUnits = [],
  replayPath = [],
  replayPosition = null,
  routeCoordinates = [],
  selectedVehicleId = null,
  showTraffic = true,
  variant = 'fleet',
  vehicles = [],
  vehicleRoutes = [],
  editablePoints = [],
  selectedEditablePointId = null,
  onEditablePointChange,
  onEditablePointSelect,
  highlightedSegment = [],
}: OperationsMapProps) {
  const hostRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const onClickPointRef = useRef(onClickPoint);
  const onVehiclePressRef = useRef(onVehiclePress);
  const vehiclesRef = useRef(vehicles);
  const vehicleMarkersRef = useRef(new Map<string, MapboxMarker>());
  const checkpointMarkersRef = useRef(new Map<string, MapboxMarker>());
  const editableMarkersRef = useRef(new Map<string, MapboxMarker>());
  const replayMarkerRef = useRef<MapboxMarker | null>(null);
  const vehicleRouteIdsRef = useRef(new Set<string>());
  const fittedKeyRef = useRef('');
  const geolocationRequestedRef = useRef(false);
  const syncLinesRef = useRef<() => void>(() => undefined);
  const styleSyncPendingRef = useRef(false);
  const initializationGuardLoggedRef = useRef(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [cameraMode, setCameraMode] = useState<'center' | 'follow' | 'user'>('center');
  const mapStyle = mapMode === 'satellite'
    ? 'mapbox://styles/mapbox/satellite-streets-v12'
    : mapMode === 'traffic' || showTraffic
      ? 'mapbox://styles/mapbox/navigation-night-v1'
      : 'mapbox://styles/mapbox/dark-v11';
  const appliedMapStyleRef = useRef(mapStyle);
  const unitByVehicleId = useMemo(
    () => new Map(operationalUnits.map((unit) => [unit.unitId, unit])),
    [operationalUnits]
  );
  const operationalViews = useMemo(
    () => vehicles.map((vehicle) => buildOperationalVehicleView(vehicle, unitByVehicleId.get(vehicle.id))),
    [unitByVehicleId, vehicles]
  );
  const shouldClusterFleet = mapMode === 'operational' &&
    operationalViews.filter((view) => Boolean(view.point)).length >= FLEET_CLUSTER_THRESHOLD;
  const fleetClusterData = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
    type: 'FeatureCollection',
    features: operationalViews.flatMap(({ vehicle, unit, point }) => {
      if (!point) return [];
      const tone = getMarkerTone(vehicle, unit, selectedVehicleId);
      return [{
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: toLngLat(point) },
        properties: {
          vehicleId: vehicle.id,
          code: vehicle.code,
          tone: tone.background,
          selected: vehicle.id === selectedVehicleId ? 1 : 0,
        },
      }];
    }),
  }), [operationalViews, selectedVehicleId]);
  const cameraOperationalUnits = useMemo(() => {
    if (mapMode !== 'operational') return operationalUnits;
    const current = operationalUnits.filter((unit) => unit.gps.connectionState !== 'lost');
    // Si el filtro actual muestra exclusivamente últimas posiciones perdidas,
    // se encuadran esas posiciones. En la vista general, una coordenada perdida
    // no puede arrastrar toda la cámara a escala continental.
    return current.length ? current : operationalUnits;
  }, [mapMode, operationalUnits]);
  const boundsPoints = useMemo(
    () => getBoundsPoints({ checkpoints, replayPath, replayPosition, routeCoordinates, operationalUnits: cameraOperationalUnits }),
    [cameraOperationalUnits, checkpoints, replayPath, replayPosition, routeCoordinates]
  );
  const boundsPointsRef = useRef(boundsPoints);
  boundsPointsRef.current = boundsPoints;
  const fitTriggerKey = useMemo(() => {
    if (mapMode === 'operational') {
      const locatedVehicleIds = operationalViews
        .filter((view) => Boolean(view.point))
        .map((view) => view.vehicle.id)
        .sort();
      return locatedVehicleIds.join('|');
    }
    return boundsPoints.map((point) => `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`).join('|');
  }, [boundsPoints, mapMode, operationalViews]);

  useEffect(() => {
    onClickPointRef.current = onClickPoint;
    onVehiclePressRef.current = onVehiclePress;
    vehiclesRef.current = vehicles;
  });

  useEffect(() => {
    const host = hostRef.current;
    const initializationGuard = {
      blocked: !host || Boolean(mapRef.current) || !MAPBOX_ACCESS_TOKEN,
      hostAvailable: Boolean(host),
      mapAlreadyInitialized: Boolean(mapRef.current),
      mapUnavailable,
      tokenConfigured: Boolean(MAPBOX_ACCESS_TOKEN),
      tokenLength: MAPBOX_ACCESS_TOKEN.length,
    };
    if (initializationGuard.blocked && !initializationGuardLoggedRef.current) {
      initializationGuardLoggedRef.current = true;
      console.warn('[OperationsMap] new mapboxgl.Map() bloqueado', initializationGuard);
    }
    if (initializationGuard.blocked) return;

    const initialPoint = toValidPoint(boundsPoints[0]) || { latitude: 19.4326, longitude: -99.1332 };
    let map: MapboxMap;
    try {
      map = new mapboxgl.Map({
        attributionControl: false,
        center: toLngLat(initialPoint),
        container: host,
        interactive: true,
        logoPosition: 'bottom-left',
        style: mapStyle,
        zoom: 12,
      });
    } catch (error) {
      // Blindaje: si el mapa no se puede construir mostramos el fallback con las
      // ubicaciones registradas en vez de propagar al error boundary.
      console.warn('[OperationsMap] no se pudo inicializar el mapa', error);
      setMapUnavailable(true);
      return;
    }
    const handleMapError = (event: mapboxgl.ErrorEvent) => {
      const err = event.error as Error & { status?: number };
      const status = Number(err?.status);
      if (status === 401 || status === 403) {
        setMapUnavailable(true);
        return;
      }
      if (status) {
        console.warn('[Mapbox] HTTP error', status, err?.message);
      }
    };
    const handleWebGLContextLost = () => {
      console.warn('[Mapbox] WebGL context lost, attempting recovery');
      setTimeout(() => map.resize(), 500);
    };
    map.on('error', handleMapError);
    map.on('webglcontextlost', handleWebGLContextLost);
    map.on('click', (event) => {
      onClickPointRef.current?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
    });
    const markUserCamera = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) setCameraMode('user');
    };
    map.on('dragstart', markUserCamera as never);
    map.on('zoomstart', markUserCamera as never);
    map.on('rotatestart', markUserCamera as never);
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false, showZoom: true }), 'top-right');
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-right');
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
      editableMarkersRef.current.forEach((marker) => marker.remove());
      replayMarkerRef.current?.remove();
      map.off('error', handleMapError);
      map.off('webglcontextlost', handleWebGLContextLost);
      map.off('dragstart', markUserCamera as never);
      map.off('zoomstart', markUserCamera as never);
      map.off('rotatestart', markUserCamera as never);
      resizeObserver?.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const syncLinesUnsafe = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    // Las polilineas se filtran igual que los bounds: una coordenada invalida
    // produce un LineString con NaN que Mapbox no puede teselar.
    const routeLine = toValidPoints(routeCoordinates);
    if (routeLine.length >= 2) setLine(map, 'operations-route', routeLine, portalPalette.accent, 4);
    else removeLine(map, 'operations-route');
    const nextVehicleRouteIds = new Set<string>();
    vehicleRoutes.forEach((entry) => {
      const coordinates = toValidPoints(entry.coordinates);
      if (coordinates.length < 2) return;
      const id = `operations-vehicle-route-${entry.vehicleId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
      nextVehicleRouteIds.add(id);
      const selected = entry.vehicleId === selectedVehicleId;
      setLine(map, id, coordinates, selected ? portalPalette.accent : entry.color || portalPalette.mutedSoft, selected ? 5 : 3, selected ? 0.96 : 0.52);
    });
    vehicleRouteIdsRef.current.forEach((id) => {
      if (!nextVehicleRouteIds.has(id)) removeLine(map, id);
    });
    vehicleRouteIdsRef.current = nextVehicleRouteIds;
    const highlightLine = toValidPoints(highlightedSegment);
    if (highlightLine.length === 2) setLine(map, 'operations-route-highlight', highlightLine, '#38bdf8', 8, 0.42);
    else removeLine(map, 'operations-route-highlight');
    const replayCoordinates = toValidPoints(replayPath.map(positionToPoint));
    if (replayCoordinates.length >= 2) setLine(map, 'operations-replay', replayCoordinates, portalPalette.info, 3, 0.72);
    else removeLine(map, 'operations-replay');
  }, [highlightedSegment, replayPath, routeCoordinates, selectedVehicleId, vehicleRoutes]);

  const syncLines = useCallback(() => {
    try {
      syncLinesUnsafe();
    } catch (error) {
      // Blindaje: un fallo dibujando rutas degrada a mapa sin polilineas.
      console.warn('[OperationsMap] no se pudieron sincronizar las rutas', error);
    }
  }, [syncLinesUnsafe]);

  useEffect(() => {
    syncLinesRef.current = syncLines;
  }, [syncLines]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedMapStyleRef.current === mapStyle) return;
    appliedMapStyleRef.current = mapStyle;
    map.setStyle(mapStyle);
    styleSyncPendingRef.current = true;
    map.once('style.load', () => {
      styleSyncPendingRef.current = false;
      syncLinesRef.current();
    });
  }, [mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      syncLines();
      return;
    }
    if (styleSyncPendingRef.current) return;
    styleSyncPendingRef.current = true;
    map.once('style.load', () => {
      styleSyncPendingRef.current = false;
      syncLinesRef.current();
    });
  }, [syncLines]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;
    const sync = () => {
      if (cancelled || !mapRef.current || !mapRef.current.isStyleLoaded()) return;
      try {
        if (shouldClusterFleet) syncFleetClusterLayers(mapRef.current, fleetClusterData);
        else removeFleetClusterLayers(mapRef.current);
      } catch (error) {
        console.warn('[OperationsMap] no se pudo sincronizar clustering de flota', error);
      }
    };

    if (map.isStyleLoaded()) sync();
    else map.once('style.load', sync);

    return () => {
      cancelled = true;
      map.off('style.load', sync);
    };
  }, [fleetClusterData, mapStyle, shouldClusterFleet]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !shouldClusterFleet) return;

    const handleClusterClick = (event: any) => {
      event?.originalEvent?.stopPropagation?.();
      const feature = event?.features?.[0];
      const coordinates = feature?.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) return;
      map.easeTo({
        center: [Number(coordinates[0]), Number(coordinates[1])],
        duration: 420,
        easing: cameraEasing,
        zoom: Math.min(14, map.getZoom() + 2),
      });
    };
    const handleVehicleClick = (event: any) => {
      event?.originalEvent?.stopPropagation?.();
      const vehicleId = String(event?.features?.[0]?.properties?.vehicleId || '');
      if (!vehicleId) return;
      const latest = vehiclesRef.current.find((vehicle) => vehicle.id === vehicleId);
      if (latest) onVehiclePressRef.current?.(latest);
    };
    const showPointer = () => { map.getCanvas().style.cursor = 'pointer'; };
    const clearPointer = () => { map.getCanvas().style.cursor = ''; };

    map.on('click', FLEET_CLUSTER_LAYER_ID, handleClusterClick as never);
    map.on('click', FLEET_POINT_LAYER_ID, handleVehicleClick as never);
    map.on('mouseenter', FLEET_CLUSTER_LAYER_ID, showPointer as never);
    map.on('mouseenter', FLEET_POINT_LAYER_ID, showPointer as never);
    map.on('mouseleave', FLEET_CLUSTER_LAYER_ID, clearPointer as never);
    map.on('mouseleave', FLEET_POINT_LAYER_ID, clearPointer as never);

    return () => {
      map.off('click', FLEET_CLUSTER_LAYER_ID, handleClusterClick as never);
      map.off('click', FLEET_POINT_LAYER_ID, handleVehicleClick as never);
      map.off('mouseenter', FLEET_CLUSTER_LAYER_ID, showPointer as never);
      map.off('mouseenter', FLEET_POINT_LAYER_ID, showPointer as never);
      map.off('mouseleave', FLEET_CLUSTER_LAYER_ID, clearPointer as never);
      map.off('mouseleave', FLEET_POINT_LAYER_ID, clearPointer as never);
      clearPointer();
    };
  }, [shouldClusterFleet]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (shouldClusterFleet) {
      vehicleMarkersRef.current.forEach((marker) => marker.remove());
      vehicleMarkersRef.current.clear();
      return;
    }
    const nextIds = new Set<string>();

    operationalViews.forEach(({ vehicle, unit, point }) => {
      if (!point) return;
      nextIds.add(vehicle.id);
      let marker = vehicleMarkersRef.current.get(vehicle.id);
      const markerTone = getMarkerTone(vehicle, unit, selectedVehicleId);
      if (!marker) {
        const element = createMarkerElement({
          ...markerTone,
          label: vehicle.code,
          title: `${vehicle.code} · ${getDriverName(unit)}${getMarkerGpsSuffix(unit)}`,
          shape: 'pill',
        });
        element.classList.toggle('is-active', vehicle.id === selectedVehicleId);
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
        element.title = `${vehicle.code} · ${getDriverName(unit)}${getMarkerGpsSuffix(unit)}`;
        element.setAttribute('aria-label', element.title);
        element.style.background = markerTone.background;
        element.style.border = `2px solid ${markerTone.border}`;
        element.classList.toggle('is-active', vehicle.id === selectedVehicleId);
      }
    });

    vehicleMarkersRef.current.forEach((marker, vehicleId) => {
      if (!nextIds.has(vehicleId)) {
        marker.remove();
        vehicleMarkersRef.current.delete(vehicleId);
      }
    });
  }, [operationalViews, selectedVehicleId, shouldClusterFleet]);

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
          element: createMarkerElement({ background: portalPalette.warning, border: '#fff', label: String(checkpoint.order + 1 || index + 1), shape: 'circle' }),
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
    const nextIds = new Set<string>();
    editablePoints.forEach((entry, index) => {
      if (!isValidPoint(entry.point)) return;
      nextIds.add(entry.id);
      let marker = editableMarkersRef.current.get(entry.id);
      const selected = entry.id === selectedEditablePointId;
      const tone = entry.kind === 'origin' ? '#22c55e' : entry.kind === 'destination' ? '#ef4444' : '#38bdf8';
      if (!marker) {
        const element = createMarkerElement({ background: tone, border: selected ? '#fff' : '#081221', label: entry.kind === 'checkpoint' ? String(index) : entry.kind === 'origin' ? 'A' : 'B', title: `${entry.kind}. Arrastra para mover`, shape: 'circle' });
        element.classList.add('route-editor-point');
        element.addEventListener('click', (event) => { event.stopPropagation(); onEditablePointSelect?.(entry.id); });
        marker = new mapboxgl.Marker({ draggable: true, element }).setLngLat(toLngLat(entry.point)).addTo(map);
        marker.on('dragstart', () => element.classList.add('is-dragging'));
        marker.on('drag', () => { const point = marker!.getLngLat(); onEditablePointChange?.(entry.id, { latitude: point.lat, longitude: point.lng }); });
        marker.on('dragend', () => { element.classList.remove('is-dragging'); const point = marker!.getLngLat(); onEditablePointChange?.(entry.id, { latitude: point.lat, longitude: point.lng }); });
        editableMarkersRef.current.set(entry.id, marker);
      } else {
        marker.setLngLat(toLngLat(entry.point));
        const element = marker.getElement();
        element.style.background = tone;
        element.style.borderColor = selected ? '#fff' : '#081221';
        element.classList.toggle('is-active', selected);
      }
    });
    editableMarkersRef.current.forEach((marker, id) => { if (!nextIds.has(id)) { marker.getElement().classList.add('is-removing'); window.setTimeout(() => marker.remove(), 180); editableMarkersRef.current.delete(id); } });
  }, [editablePoints, onEditablePointChange, onEditablePointSelect, selectedEditablePointId]);

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
        element: createMarkerElement({ background: portalPalette.accent, border: '#fff', label: '▶', shape: 'circle' }),
        rotation: Number(replayPosition?.heading) || 0,
      }).setLngLat(toLngLat(point)).addTo(map);
      return;
    }
    replayMarkerRef.current.setLngLat(toLngLat(point));
    replayMarkerRef.current.setRotation(Number(replayPosition?.heading) || 0);
  }, [replayPosition]);

  useEffect(() => {
    const map = mapRef.current;
    const points = boundsPointsRef.current;
    if (!map || !autoFit || cameraMode !== 'center' || !points.length || fitTriggerKey === fittedKeyRef.current) return;

    let cancelled = false;
    let attempts = 0;
    let timer = 0;
    const attempt = () => {
      if (cancelled || !mapRef.current) return;
      const cameraPolicy = mapMode === 'operational'
        ? { minZoom: MIN_OPERATIONAL_AUTO_ZOOM, singleZoom: SINGLE_VEHICLE_AUTO_ZOOM }
        : undefined;
      if (applyCamera(mapRef.current, points, cameraPolicy)) {
        fittedKeyRef.current = fitTriggerKey;
        return;
      }
      // El canvas aun no tiene tamano util (montaje diferido por Suspense,
      // panel colapsado). Reintentamos en vez de encuadrar contra 0x0.
      attempts += 1;
      if (attempts <= 10) timer = window.setTimeout(attempt, 120);
    };
    attempt();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [autoFit, cameraMode, fitTriggerKey, mapMode]);

  useEffect(() => {
    if (!selectedVehicleId || !mapRef.current) return;
    const point = getVehiclePoint(unitByVehicleId.get(selectedVehicleId));
    if (!point) return;
    // Seleccionar desde marcador o lista es una orden explicita del usuario.
    // Centra una sola vez sin convertir la seleccion en seguimiento permanente.
    mapRef.current.easeTo({
      center: toLngLat(point),
      duration: 450,
      easing: cameraEasing,
      zoom: Math.max(14, mapRef.current.getZoom()),
    });
  }, [selectedVehicleId]);

  useEffect(() => {
    if (cameraMode !== 'follow' || !selectedVehicleId || !mapRef.current) return;
    const point = getVehiclePoint(unitByVehicleId.get(selectedVehicleId));
    if (!point) return;
    mapRef.current.easeTo({ center: toLngLat(point), duration: 450, easing: cameraEasing });
  }, [cameraMode, selectedVehicleId, unitByVehicleId]);

  // Encuadre por geolocalizacion: SOLO cuando no hay ninguna unidad posicionable.
  // No toca la logica de fitBounds; solo mueve el centro por defecto. Se pide una
  // sola vez por sesion de pantalla (geolocationRequestedRef) y degrada en silencio
  // si el navegador no la soporta, el contexto no es seguro, o el usuario la niega.
  useEffect(() => {
    if (geolocationRequestedRef.current) return;
    if (!autoFit) return;
    if (!mapRef.current) return; // el mapa aun no monta
    if (boundsPointsRef.current.length > 0) return; // hay unidades -> manda fitBounds
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    if (typeof window !== 'undefined' && window.isSecureContext === false) return; // requiere HTTPS

    // Margen de gracia: si en este lapso llega una unidad, boundsPoints cambia, el
    // efecto se re-ejecuta, se cancela este timer y ya no se pide la ubicacion.
    const graceTimer = window.setTimeout(() => {
      if (geolocationRequestedRef.current || !mapRef.current || boundsPointsRef.current.length > 0) return;
      geolocationRequestedRef.current = true;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const map = mapRef.current;
          // Si ya llegaron unidades, fitBounds tomo el control aunque la respuesta
          // llegue tarde: no mover la camara.
          if (!map || boundsPointsRef.current.length > 0) return;
          const point = toValidPoint({ latitude: position.coords.latitude, longitude: position.coords.longitude });
          if (!point) return;
          map.easeTo({ center: toLngLat(point), duration: 600, easing: cameraEasing, zoom: GEO_CITY_ZOOM });
        },
        () => undefined, // permiso denegado / timeout / error: conservar encuadre por defecto
        { enableHighAccuracy: false, maximumAge: GEO_MAX_AGE_MS, timeout: GEO_TIMEOUT_MS }
      );
    }, GEO_GRACE_MS);

    return () => window.clearTimeout(graceTimer);
  }, [autoFit, boundsPoints]);

  if (!MAPBOX_ACCESS_TOKEN || mapUnavailable) {
    const locatedVehicles = vehicles.filter((vehicle) => Boolean(getVehiclePoint(unitByVehicleId.get(vehicle.id))));
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
    if (!isReplay && routeCoordinates.length >= 2) {
      return (
        <View {...({ className: 'route-preview-fallback' } as any)} style={[styles.fallback, styles.routeFallback, { height, minHeight: typeof height === 'number' ? height : 460 }]}>
          <View style={styles.fallbackHeader}><View style={styles.fallbackIcon}><MaterialCommunityIcons name="map-outline" size={20} color={portalPalette.accent} /></View><View style={styles.fallbackHeaderText}><Text style={styles.fallbackTitle}>Vista previa de la ruta</Text><Text style={styles.fallbackText}>{reason} La geometría guardada permanece visible.</Text></View></View>
          <View style={styles.routeFallbackGeometry}><RouteGeometryThumbnail color={portalPalette.accent} large polyline={routeCoordinates} stops={checkpoints} /></View>
        </View>
      );
    }
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
              const unit = unitByVehicleId.get(vehicle.id);
              const point = getVehiclePoint(unit);
              const active = vehicle.id === selectedVehicleId;
              return (
                <Pressable
                  key={vehicle.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver ${vehicle.code} de ${getDriverName(unit)}`}
                  onPress={() => onVehiclePress?.(vehicle)}
                  style={[styles.fallbackUnit, active ? styles.fallbackUnitActive : undefined]}>
                  <Text style={[styles.fallbackUnitCode, active ? styles.fallbackUnitTextActive : undefined]}>
                    {vehicle.code} · {getDriverName(unit)}
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

  return (
    <View nativeID={mapMode === 'operational' ? 'operations-map-canvas' : undefined} style={[styles.map, { height, minHeight: typeof height === 'number' ? height : 0 }]}>
      <View ref={hostRef as never} style={styles.mapCanvas} />
      {mapMode === 'operational' ? (
        <View nativeID="operations-camera-controls" style={styles.cameraControls}>
          <Pressable
            accessibilityLabel="Centrar flota"
            onPress={() => {
              setCameraMode('center');
              fittedKeyRef.current = '';
              if (mapRef.current) {
                applyCamera(
                  mapRef.current,
                  boundsPointsRef.current,
                  mapMode === 'operational'
                    ? { minZoom: MIN_OPERATIONAL_AUTO_ZOOM, singleZoom: SINGLE_VEHICLE_AUTO_ZOOM }
                    : undefined
                );
              }
            }}
            style={[styles.cameraButton, cameraMode === 'center' ? styles.cameraButtonActive : undefined]}>
            <MaterialCommunityIcons name="crosshairs-gps" size={17} color={portalPalette.text} />
          </Pressable>
          {selectedVehicleId ? (
            <Pressable
              accessibilityLabel="Seguir unidad seleccionada"
              onPress={() => setCameraMode('follow')}
              style={[styles.cameraButton, cameraMode === 'follow' ? styles.cameraButtonActive : undefined]}>
              <MaterialCommunityIcons name="target" size={17} color={portalPalette.text} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  routeFallback: { overflow: 'hidden', padding: 0 },
  routeFallbackGeometry: { flex: 1, minHeight: 0, width: '100%' },
  fallback: {
    alignItems: 'flex-start',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    gap: 10,
    justifyContent: 'flex-start',
    padding: 14,
  },
  fallbackHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  fallbackHeaderText: {
    flex: 1,
    gap: 2,
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
    gap: 8,
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
    gap: 1,
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
  mapCanvas: {
    height: '100%',
    width: '100%',
  },
  cameraControls: {
    bottom: AppTheme.spacing.sm,
    flexDirection: 'row',
    gap: AppTheme.spacing.xs,
    left: AppTheme.spacing.sm,
    position: 'absolute',
  },
  cameraButton: {
    alignItems: 'center',
    backgroundColor: portalPalette.surface,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
    height: DesignSystem.control.sm,
    justifyContent: 'center',
    width: DesignSystem.control.sm,
  },
  cameraButtonActive: {
    backgroundColor: portalPalette.infoSoft,
    borderColor: portalPalette.info,
  },
});
