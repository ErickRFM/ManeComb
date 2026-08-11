import { Pressable, StyleSheet, Text, View } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { AppMap, AppMapMarker, AppMapPolyline, type AppMapPadding, type AppMapRef } from '@/src/components/app-map';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { OperationalUnitSnapshot } from '@shared/operational-contract';
import { formatFreshness, freshnessOpacity, stateColor } from '@shared/operational-contract';
import type { GeoPoint, Incident, LiveLocationsData, NavigationPlaceResult, NavigationRouteOption, NavigationStop, Vehicle } from '@/src/types/app';
import type { SelectorPointRole } from '../types';
import { mapStyles as styles } from '../map-styles';
import { shouldShowDeviceLocationMarker } from '../utils/tracking';

type SelectorPoints = Record<SelectorPointRole, NavigationPlaceResult | null>;

type MapCanvasProps = {
  coordinates: GeoPoint | null;
  mapData: LiveLocationsData;
  mapPadding: AppMapPadding;
  mapRef: React.RefObject<AppMapRef | null>;
  mapUnits: OperationalUnitSnapshot[];
  onMapSelectorPress: (location: GeoPoint) => void;
  onSelectorDragStart: () => void;
  onSelectorPointDragEnd: (role: SelectorPointRole, location: GeoPoint) => void;
  onUnitPress: (unit: OperationalUnitSnapshot) => void;
  onUserInteraction?: () => void;
  scaleBarPosition?:
    | { bottom: number; left: number }
    | { bottom: number; right: number }
    | { left: number; top: number }
    | { right: number; top: number };
  selectorMode: boolean;
  selectorPoints: SelectorPoints;
  selectorRoute: NavigationRouteOption | null;
  selectorStops: NavigationStop[];
  selectedUnit: OperationalUnitSnapshot | null;
  trafficEnabled: boolean;
  visibleIncidents: Incident[];
  vehicleById: Map<string, Vehicle>;
};

export function MapCanvas({
  coordinates,
  mapData,
  mapPadding,
  mapRef,
  mapUnits,
  onMapSelectorPress,
  onSelectorDragStart,
  onSelectorPointDragEnd,
  onUnitPress,
  onUserInteraction,
  scaleBarPosition,
  selectorMode,
  selectorPoints,
  selectorRoute,
  selectorStops,
  selectedUnit,
  trafficEnabled,
  visibleIncidents,
  vehicleById,
}: MapCanvasProps) {
  const { theme } = useAppTheme();
  const initialUnit = selectedUnit?.gps.recordedAt ? selectedUnit : mapUnits[0] || null;
  const initialPoint =
    initialUnit && initialUnit.gps.lat !== null && initialUnit.gps.lng !== null
      ? { latitude: initialUnit.gps.lat, longitude: initialUnit.gps.lng }
      : coordinates || mapData.center;
  const showDeviceLocationMarker = shouldShowDeviceLocationMarker(selectorMode, mapUnits.length);

  return (
    <AppMap
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialRegion={{
        latitude: initialPoint.latitude,
        longitude: initialPoint.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      }}
      mapPadding={mapPadding}
      compassEnabled={false}
      scaleBarPosition={scaleBarPosition}
      scaleEnabled
      showsTraffic={trafficEnabled}
      themeMode={theme.mode}
      onUserInteraction={onUserInteraction}
      onPress={(event) => {
        if (!selectorMode) return;
        const { latitude, longitude } = event.nativeEvent.coordinate || {};
        if (typeof latitude === 'number' && typeof longitude === 'number') {
          onMapSelectorPress({ latitude, longitude });
        }
      }}>
      <RouteLayers
        mapData={mapData}
        selectorMode={selectorMode}
        selectorRoute={selectorRoute}
      />
      {!selectorMode ? (
        <UnitMarkers units={mapUnits} onUnitPress={onUnitPress} selectedUnit={selectedUnit} />
      ) : null}
      {!selectorMode ? (
        <IncidentMarkers incidents={visibleIncidents} vehicleById={vehicleById} />
      ) : null}
      {selectorMode ? (
        <SelectorMarkers
          onDragStart={onSelectorDragStart}
          onPointDragEnd={onSelectorPointDragEnd}
          points={selectorPoints}
          stops={selectorStops}
        />
      ) : null}
      {showDeviceLocationMarker && coordinates ? (
        <AppMapMarker id="user-location" coordinate={coordinates}>
          <View style={[styles.userMarker, { backgroundColor: theme.colors.info }]} />
        </AppMapMarker>
      ) : null}
    </AppMap>
  );
}

function RouteLayers({
  mapData,
  selectorMode,
  selectorRoute,
}: Pick<MapCanvasProps, 'mapData' | 'selectorMode' | 'selectorRoute'>) {
  const { theme } = useAppTheme();

  if (selectorMode) {
    return selectorRoute?.polyline?.length ? (
      <AppMapPolyline id="selector-route" coordinates={selectorRoute.polyline} strokeColor={theme.colors.accent} strokeWidth={3} />
    ) : null;
  }

  return (
    <>
      {mapData.routes.map((route) => (
        <AppMapPolyline key={route.id} id={route.id} coordinates={route.polyline} strokeColor={route.color} strokeWidth={3} />
      ))}
    </>
  );
}

/**
 * Marcadores de unidad.
 *
 * El color sale de `operationalState` y la opacidad de `gps.freshness`, ambos
 * resueltos en backend. Una unidad con GPS vencido se dibuja atenuada; nunca
 * se omite. La unica exclusion es no tener coordenada que dibujar.
 */
function UnitMarkers({
  onUnitPress,
  selectedUnit,
  units,
}: {
  onUnitPress: (unit: OperationalUnitSnapshot) => void;
  selectedUnit: OperationalUnitSnapshot | null;
  units: OperationalUnitSnapshot[];
}) {
  const { theme } = useAppTheme();

  return (
    <>
      {units.map((unit) => {
        if (unit.gps.lat === null || unit.gps.lng === null) return null;
        const isSelected = unit.unitId === selectedUnit?.unitId;
        // Una posicion que no es fresca sigue dibujandose, pero no puede
        // parecer una lectura en vivo.
        const isLastKnown = unit.gps.freshness !== 'fresh';
        const unitMarkerStyle = {
          backgroundColor: stateColor(unit.operationalState),
          borderColor: isSelected ? theme.colors.warning : '#FFF',
          opacity: freshnessOpacity(unit.gps.freshness),
          transform: [{ scale: isSelected ? 1.18 : 1 }],
        };

        // MarkerView (view annotation nativa) en vez de PointAnnotation: no rasteriza a bitmap,
        // así que la sombra/elevation del dot y el transform scale(1.18) de la unidad
        // seleccionada ya no se recortan (PointAnnotation medía con MeasureSpec.EXACTLY y
        // cortaba lo pintado fuera de bounds, #3769). MarkerView no tiene onPress propio → el
        // tap para seleccionar va en un Pressable que envuelve el contenido; `allowOverlap`
        // evita que unidades cercanas colapsen.
        return (
          <Mapbox.MarkerView
            key={unit.unitId}
            coordinate={[unit.gps.lng, unit.gps.lat]}
            allowOverlap>
            <Pressable style={styles.vehicleMarkerWrap} onPress={() => onUnitPress(unit)}>
              <View
                style={[
                  styles.vehicleMarker,
                  unitMarkerStyle,
                  isLastKnown ? styles.vehicleMarkerStale : undefined,
                ]}>
                <View style={isLastKnown ? styles.vehicleMarkerInnerStale : styles.vehicleMarkerInner} />
              </View>
              {/*
                El folio identifica al chofer de un vistazo. La antiguedad solo
                aparece cuando la posicion no es fresca, para no repetir ruido
                en las unidades que si estan reportando.
              */}
              <View style={styles.vehicleMarkerLabel}>
                <Text style={styles.vehicleMarkerLabelText} numberOfLines={1}>
                  {unit.label}
                </Text>
                {isLastKnown ? (
                  <Text style={styles.vehicleMarkerAgeText} numberOfLines={1}>
                    {formatFreshness(unit.gps)}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          </Mapbox.MarkerView>
        );
      })}
    </>
  );
}

function IncidentMarkers({
  incidents,
  vehicleById,
}: {
  incidents: Incident[];
  vehicleById: Map<string, Vehicle>;
}) {
  const { theme } = useAppTheme();

  return (
    <>
      {incidents.map((incident) => {
        const vehicle = vehicleById.get(incident.vehicleId || '');
        const coordinate = incident.location || vehicle?.location;
        if (!coordinate) return null;
        return (
          <AppMapMarker key={incident.id} id={`incident-${incident.id}`} coordinate={coordinate}>
            <View style={[styles.incidentMarker, { backgroundColor: incident.severity === 'critical' ? theme.colors.danger : theme.colors.warning }]}>
              <MaterialCommunityIcons name="alert" size={13} color="#FFF" />
            </View>
          </AppMapMarker>
        );
      })}
    </>
  );
}

function SelectorMarkers({
  onDragStart,
  onPointDragEnd,
  points,
  stops,
}: {
  onDragStart: () => void;
  onPointDragEnd: (role: SelectorPointRole, location: GeoPoint) => void;
  points: SelectorPoints;
  stops: NavigationStop[];
}) {
  const { theme } = useAppTheme();

  return (
    <>
      {points.origin ? (
        <AppMapMarker
          id="selector-origin"
          coordinate={points.origin.location}
          draggable
          onDragStart={onDragStart}
          onDragEnd={(event) => onPointDragEnd('origin', event.nativeEvent.coordinate)}>
          <View style={[styles.selectorPointMarker, { backgroundColor: theme.colors.success }]}>
            <Text style={styles.selectorPointMarkerText}>SAL</Text>
          </View>
        </AppMapMarker>
      ) : null}
      {points.destination ? (
        <AppMapMarker
          id="selector-destination"
          coordinate={points.destination.location}
          draggable
          onDragStart={onDragStart}
          onDragEnd={(event) => onPointDragEnd('destination', event.nativeEvent.coordinate)}>
          <View style={[styles.selectorPointMarker, { backgroundColor: theme.colors.danger }]}>
            <Text style={styles.selectorPointMarkerText}>FIN</Text>
          </View>
        </AppMapMarker>
      ) : null}
      {/* MarkerView (view annotation nativa) en vez de PointAnnotation: no rasteriza a bitmap,
          así que la sombra ya no se recorta (PointAnnotation medía con MeasureSpec.EXACTLY y
          cortaba lo pintado fuera de bounds). `allowOverlap` reemplaza el transform anti-solape
          para que los pines cercanos no colapsen. Los numerados no tienen drag/onPress, así que
          MarkerView (que no soporta drag) no pierde nada; SAL/FIN se quedan en AppMapMarker. */}
      {stops.map((stop, index) => (
        <Mapbox.MarkerView
          key={stop.id}
          coordinate={[stop.longitude, stop.latitude]}
          allowOverlap>
          <View style={[styles.selectorStopMarker, { backgroundColor: theme.colors.warning }]}>
            <Text style={styles.stopMarkerText}>{index + 1}</Text>
          </View>
        </Mapbox.MarkerView>
      ))}
    </>
  );
}
