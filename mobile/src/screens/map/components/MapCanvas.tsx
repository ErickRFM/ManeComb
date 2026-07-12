import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { AppMap, AppMapMarker, AppMapPolyline, type AppMapPadding, type AppMapRef } from '@/src/components/app-map';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { GeoPoint, Incident, LiveLocationsData, NavigationPlaceResult, NavigationRouteOption, NavigationStop, Vehicle } from '@/src/types/app';
import type { SelectorPointRole } from '../types';
import { mapStyles as styles } from '../map-styles';

type SelectorPoints = Record<SelectorPointRole, NavigationPlaceResult | null>;

type MapCanvasProps = {
  compassPosition?:
    | { bottom: number; left: number }
    | { bottom: number; right: number }
    | { left: number; top: number }
    | { right: number; top: number };
  coordinates: GeoPoint | null;
  mapData: LiveLocationsData;
  mapPadding: AppMapPadding;
  mapRef: React.RefObject<AppMapRef | null>;
  mapVehicles: Vehicle[];
  onMapSelectorPress: (location: GeoPoint) => void;
  onSelectorDragStart: () => void;
  onSelectorPointDragEnd: (role: SelectorPointRole, location: GeoPoint) => void;
  onVehiclePress: (vehicle: Vehicle) => void;
  scaleBarPosition?:
    | { bottom: number; left: number }
    | { bottom: number; right: number }
    | { left: number; top: number }
    | { right: number; top: number };
  selectorMode: boolean;
  selectorPoints: SelectorPoints;
  selectorRoute: NavigationRouteOption | null;
  selectorStops: NavigationStop[];
  selectedVehicle: Vehicle | null;
  trafficEnabled: boolean;
  visibleIncidents: Incident[];
  vehicleById: Map<string, Vehicle>;
};

export function MapCanvas({
  compassPosition,
  coordinates,
  mapData,
  mapPadding,
  mapRef,
  mapVehicles,
  onMapSelectorPress,
  onSelectorDragStart,
  onSelectorPointDragEnd,
  onVehiclePress,
  scaleBarPosition,
  selectorMode,
  selectorPoints,
  selectorRoute,
  selectorStops,
  selectedVehicle,
  trafficEnabled,
  visibleIncidents,
  vehicleById,
}: MapCanvasProps) {
  const { theme } = useAppTheme();
  const initialVehicle = selectedVehicle?.locationTimestamp ? selectedVehicle : mapVehicles[0] || null;
  const initialPoint = initialVehicle?.location || coordinates || mapData.center;

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
      compassEnabled
      compassPosition={compassPosition}
      scaleBarPosition={scaleBarPosition}
      scaleEnabled
      showsTraffic={trafficEnabled}
      themeMode={theme.mode}
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
        <VehicleMarkers vehicles={mapVehicles} onVehiclePress={onVehiclePress} selectedVehicle={selectedVehicle} />
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
      {coordinates && (
        <AppMapMarker id="user-location" coordinate={coordinates}>
          <View style={[styles.userMarker, { backgroundColor: theme.colors.info }]} />
        </AppMapMarker>
      )}
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

function VehicleMarkers({
  onVehiclePress,
  selectedVehicle,
  vehicles,
}: {
  onVehiclePress: (vehicle: Vehicle) => void;
  selectedVehicle: Vehicle | null;
  vehicles: Vehicle[];
}) {
  const { theme } = useAppTheme();

  return (
    <>
      {vehicles.map((vehicle) => {
        const isSelected = vehicle.id === selectedVehicle?.id;
        const vehicleMarkerStyle = {
          backgroundColor: vehicle.status === 'maintenance' ? theme.colors.danger : theme.colors.accent,
          borderColor: isSelected ? theme.colors.warning : '#FFF',
          transform: [{ scale: isSelected ? 1.18 : 1 }],
        };

        return (
          <AppMapMarker
            key={vehicle.id}
            id={`vehicle-${vehicle.id}`}
            coordinate={vehicle.location}
            onPress={() => onVehiclePress(vehicle)}>
            <View style={[styles.vehicleMarker, vehicleMarkerStyle]}>
              <View style={styles.vehicleMarkerInner} />
            </View>
          </AppMapMarker>
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
        if (!vehicle) return null;
        return (
          <AppMapMarker key={incident.id} id={`incident-${incident.id}`} coordinate={vehicle.location}>
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
            <Text style={styles.selectorPointMarkerText}>O</Text>
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
            <Text style={styles.selectorPointMarkerText}>D</Text>
          </View>
        </AppMapMarker>
      ) : null}
      {stops.map((stop, index) => (
        <AppMapMarker key={stop.id} id={`stop-${stop.id}`} coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}>
          <View style={[styles.vehicleMarker, { backgroundColor: theme.colors.warning }]}>
            <Text style={styles.stopMarkerText}>{index + 1}</Text>
          </View>
        </AppMapMarker>
      ))}
    </>
  );
}
