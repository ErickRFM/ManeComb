import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Redirect, router, useLocalSearchParams } from '@/src/navigation/router';
import { StatusBar } from '@/src/native/status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { Typography } from '@/constants/theme';
import { AppMap, AppMapMarker, AppMapPolyline, type AppMapRef } from '@/src/components/app-map';
import { OperationalMenuDrawer } from '@/src/components/operational-menu-drawer';
import { StatusPill } from '@/src/components/status-pill';
import { planNavigationRouteRequest, reverseNavigationPlaceRequest } from '@/src/api/client';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useUserLocation } from '@/src/hooks/use-user-location';
import { useAppStore } from '@/src/store/use-app-store';
import type { GeoPoint, NavigationPlaceResult, NavigationPlan, NavigationStop } from '@/src/types/app';
import { resolveMobilePostLoginRoute } from '@/src/utils/account-routing';
import { getLocationStatus } from '@/src/utils/location-status';
import { getOperationalScheduleState } from '@/src/utils/operational-schedule';
import { getSalesPortalPathForBlockReason, openSalesPortal } from '@/src/utils/sales-portal';

const ACTIVE_TRACKING_STATUSES = new Set(['online', 'patrolling', 'on-route']);
const LOCATION_SYNC_INTERVAL_MS = 5000;
type SelectorRole = 'origin' | 'destination' | 'stop';
type SelectorPointRole = Exclude<SelectorRole, 'stop'>;

function looksLikeCoordinates(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(value.trim());
}

function getSelectorFallback(role: SelectorRole, order = 0) {
  if (role === 'origin') return 'Punto inicial';
  if (role === 'destination') return 'Punto final';
  return `Parada ${order + 1}`;
}

function getSafePlaceLabel(value: string | null | undefined, fallback: string) {
  const label = value?.trim();
  return label && !looksLikeCoordinates(label) ? label : fallback;
}

function parseOptionalPoint(params: Record<string, string | undefined>, role: SelectorPointRole): NavigationPlaceResult | null {
  const latitude = Number(params[`${role}Latitude`]);
  const longitude = Number(params[`${role}Longitude`]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const fallbackLabel = getSelectorFallback(role);
  const label = getSafePlaceLabel(params[`${role}Label`] || params[`${role}Address`], fallbackLabel);
  const address = getSafePlaceLabel(params[`${role}Address`] || label, label);

  return {
    id: `map-${role}-${latitude}-${longitude}`,
    label,
    address,
    location: { latitude, longitude },
  };
}

function createCoordinatePoint(role: SelectorRole, location: GeoPoint, order = 0): NavigationPlaceResult {
  const label = getSelectorFallback(role, order);

  return {
    id: `map-${role}-${location.latitude}-${location.longitude}`,
    label,
    address: label,
    location,
  };
}

function parseStopsParam(value?: string): NavigationStop[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((stop, index) => ({
        id: String(stop?.id || `stop-${index + 1}`),
        latitude: Number(stop?.latitude),
        longitude: Number(stop?.longitude),
        address: getSafePlaceLabel(String(stop?.address || ''), getSelectorFallback('stop', index)),
        order: Math.max(0, Number(stop?.order) || index),
      }))
      .filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude))
      .sort((left, right) => left.order - right.order)
      .map((stop, index) => ({ ...stop, order: index }));
  } catch {
    return [];
  }
}

function createStopFromPoint(point: NavigationPlaceResult, order: number): NavigationStop {
  const label = getSafePlaceLabel(point.address || point.label, getSelectorFallback('stop', order));

  return {
    id: `stop-${Date.now()}`,
    latitude: point.location.latitude,
    longitude: point.location.longitude,
    address: label,
    order,
  };
}

export function MapScreen() {
  const { theme } = useAppTheme();
  const mapRef = useRef<AppMapRef | null>(null);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    vehicleId?: string;
    follow?: string;
    point?: SelectorRole;
    returnTo?: string;
    originLatitude?: string;
    originLongitude?: string;
    originAddress?: string;
    originLabel?: string;
    destinationLatitude?: string;
    destinationLongitude?: string;
    destinationAddress?: string;
    destinationLabel?: string;
    stops?: string;
  }>();
  const {
    coordinates,
    issue: locationIssue,
    lastUpdatedAt,
    loading: locationLoading,
    permission,
    refresh,
    servicesEnabled,
  } = useUserLocation();
  const lastLocationSyncRef = useRef(0);

  const {
    connectionMode,
    authContext,
    error,
    isRefreshing,
    mapData,
    refreshAll,
    sendVehicleLocation,
    signOut,
    user,
  } = useAppStore(
    useShallow((state) => ({
      connectionMode: state.connectionMode,
      authContext: state.authContext,
      error: state.error,
      isRefreshing: state.isRefreshing,
      mapData: state.mapData,
      refreshAll: state.refreshAll,
      sendVehicleLocation: state.sendVehicleLocation,
      signOut: state.signOut,
      user: state.user,
    }))
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [followMode, setFollowMode] = useState(true);
  const [selectorPoints, setSelectorPoints] = useState<Record<SelectorPointRole, NavigationPlaceResult | null>>(() => ({
    origin: parseOptionalPoint(params, 'origin'),
    destination: parseOptionalPoint(params, 'destination'),
  }));
  const [selectorPlan, setSelectorPlan] = useState<NavigationPlan | null>(null);
  const [selectorStops, setSelectorStops] = useState<NavigationStop[]>(() => parseStopsParam(params.stops));
  const [isPlanningSelectorRoute, setIsPlanningSelectorRoute] = useState(false);
  const [trafficEnabled, setTrafficEnabled] = useState(true);
  const [activeAlertIndex, setActiveAlertIndex] = useState(0);
  const [scheduleTick, setScheduleTick] = useState(0);
  const reverseControllersRef = useRef<Partial<Record<SelectorPointRole, AbortController>>>({});

  const selectorMode = params.point === 'origin' || params.point === 'destination' || params.point === 'stop';
  const selectorRoute = selectorPlan?.routes[0] || null;

  const locationStatus = useMemo(
    () =>
      getLocationStatus({
        coordinatesReady: Boolean(coordinates),
        issue: locationIssue,
        loading: locationLoading,
        permission,
        servicesEnabled,
      }),
    [coordinates, locationIssue, locationLoading, permission, servicesEnabled]
  );
  const locationStatusColor =
    locationStatus.tone === 'ok'
      ? theme.colors.success
      : locationStatus.tone === 'error'
        ? theme.colors.danger
        : locationStatus.tone === 'warning'
          ? theme.colors.warning
          : theme.colors.muted;
  const operationalScheduleState = useMemo(
    () => getOperationalScheduleState(user?.operationalSchedule || null, new Date(Date.now() + scheduleTick * 0)),
    [scheduleTick, user?.operationalSchedule]
  );

  useEffect(() => {
    const timer = setInterval(() => setScheduleTick((current) => current + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (params.vehicleId) {
      setSelectedVehicleId(params.vehicleId);
      if (params.follow === 'true') setFollowMode(true);
    }
  }, [params.vehicleId, params.follow]);

  useEffect(() => {
    const controllers = reverseControllersRef.current;

    return () => {
      controllers.origin?.abort();
      controllers.destination?.abort();
    };
  }, []);

  const prioritizedVehicles = useMemo(() => {
    return [...(mapData?.vehicles || [])].sort((left, right) => {
      return right.delayMinutes - left.delayMinutes || left.code.localeCompare(right.code);
    });
  }, [mapData?.vehicles]);

  const selectedVehicle = useMemo(() =>
    prioritizedVehicles.find((vehicle) => vehicle.id === selectedVehicleId) || prioritizedVehicles[0] || null,
  [prioritizedVehicles, selectedVehicleId]);

  const trackingVehicles = useMemo(() => {
    return prioritizedVehicles.filter((vehicle) => ACTIVE_TRACKING_STATUSES.has(vehicle.status));
  }, [prioritizedVehicles]);

  const visibleIncidents = useMemo(() => {
    if (!mapData) {
      return [];
    }

    return mapData.incidents.filter((incident) =>
      mapData.vehicles.some((vehicle) => vehicle.id === incident.vehicleId)
    );
  }, [mapData]);

  const activeIncident = visibleIncidents.length
    ? visibleIncidents[activeAlertIndex % visibleIncidents.length]
    : null;

  const activeIncidentVehicle = activeIncident
    ? mapData?.vehicles.find((vehicle) => vehicle.id === activeIncident.vehicleId) || null
    : null;

  const focusMap = (latitude: number, longitude: number, zoom: 'close' | 'vehicle' | 'overview' = 'vehicle') => {
    const latitudeDelta = zoom === 'close' ? 0.015 : zoom === 'overview' ? 0.08 : 0.03;
    mapRef.current?.animateToRegion({
      latitude,
      longitude,
      latitudeDelta,
      longitudeDelta: latitudeDelta,
    }, 400);
  };

  const updateSelectorPoint = (role: SelectorPointRole, location: GeoPoint) => {
    const point = createCoordinatePoint(role, location);

    setSelectorPlan(null);
    setSelectorPoints((current) => ({
      ...current,
      [role]: point,
    }));
    focusMap(location.latitude, location.longitude, 'close');

    reverseControllersRef.current[role]?.abort();
    const controller = new AbortController();
    reverseControllersRef.current[role] = controller;

    reverseNavigationPlaceRequest(location, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        setSelectorPoints((current) => {
          const activePoint = current[role];

          if (
            !activePoint ||
            activePoint.location.latitude !== location.latitude ||
            activePoint.location.longitude !== location.longitude
          ) {
            return current;
          }

          const fallback = getSelectorFallback(role);
          const label = getSafePlaceLabel(response.result.label || response.result.address, fallback);
          const address = getSafePlaceLabel(response.result.address || response.result.label, label);

          return {
            ...current,
            [role]: {
              ...response.result,
              label,
              address,
            },
          };
        });
      })
      .catch(() => undefined);
  };

  const handleSelectorPress = (location: GeoPoint) => {
    const role: SelectorRole = !selectorPoints.origin
      ? 'origin'
      : !selectorPoints.destination
        ? 'destination'
        : 'stop';

    if (role === 'stop') {
      const stopOrder = selectorStops.length;
      const point = createCoordinatePoint(role, location, stopOrder);
      const stop = createStopFromPoint(point, selectorStops.length);
      const stopKey = `${stop.latitude.toFixed(6)},${stop.longitude.toFixed(6)}`;
      const originKey = selectorPoints.origin
        ? `${selectorPoints.origin.location.latitude.toFixed(6)},${selectorPoints.origin.location.longitude.toFixed(6)}`
        : '';
      const destinationKey = selectorPoints.destination
        ? `${selectorPoints.destination.location.latitude.toFixed(6)},${selectorPoints.destination.location.longitude.toFixed(6)}`
        : '';

      if (
        stopKey === originKey ||
        stopKey === destinationKey ||
        selectorStops.some((current) => `${current.latitude.toFixed(6)},${current.longitude.toFixed(6)}` === stopKey)
      ) {
        return;
      }

      setSelectorPlan(null);
      setSelectorStops((current) => [...current, stop]);
      focusMap(location.latitude, location.longitude, 'close');
      reverseNavigationPlaceRequest(location)
        .then((response) => {
          const label = getSafePlaceLabel(response.result.address || response.result.label, getSelectorFallback('stop', stopOrder));
          setSelectorStops((current) =>
            current.map((entry) => (entry.id === stop.id ? { ...entry, address: label } : entry))
          );
        })
        .catch(() => undefined);
      return;
    }

    updateSelectorPoint(role, location);
  };

  const removeLastSelectorStop = () => {
    setSelectorPlan(null);
    setSelectorStops((current) => current.slice(0, -1));
  };

  useEffect(() => {
    if (!selectorMode || !selectorPoints.origin || !selectorPoints.destination) {
      setIsPlanningSelectorRoute(false);
      return;
    }

    const controller = new AbortController();
    setSelectorPlan(null);
    setIsPlanningSelectorRoute(true);

    planNavigationRouteRequest(
      {
        origin: selectorPoints.origin.location,
        destination: selectorPoints.destination.location,
        stops: selectorStops,
      },
      { signal: controller.signal }
    )
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        setSelectorPlan(response);

        const routeCoordinates = response.routes[0]?.polyline?.length
          ? response.routes[0].polyline
          : [selectorPoints.origin!.location, selectorPoints.destination!.location];

        mapRef.current?.fitToCoordinates(routeCoordinates, {
          animated: true,
          edgePadding: {
            top: insets.top + 120,
            right: 86,
            bottom: insets.bottom + 230,
            left: 24,
          },
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSelectorPlan(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsPlanningSelectorRoute(false);
        }
      });

    return () => controller.abort();
  }, [
    insets.bottom,
    insets.top,
    selectorMode,
    selectorPoints.destination,
    selectorPoints.origin,
    selectorStops,
  ]);

  const focusNextAlert = () => {
    if (!visibleIncidents.length || !mapData) {
      router.push('/incidencias');
      return;
    }

    const nextIndex = activeAlertIndex + 1;
    const incident = visibleIncidents[nextIndex % visibleIncidents.length];
    const vehicle = mapData.vehicles.find((entry) => entry.id === incident.vehicleId);

    setActiveAlertIndex(nextIndex);

    if (vehicle) {
      setSelectedVehicleId(vehicle.id);
      setFollowMode(false);
      focusMap(vehicle.location.latitude, vehicle.location.longitude, 'close');
    }
  };

  useEffect(() => {
    if (followMode && selectedVehicle) {
      focusMap(selectedVehicle.location.latitude, selectedVehicle.location.longitude);
    }
  }, [selectedVehicle?.location, followMode, selectedVehicle]);

  // When in selector mode, if a vehicle is selected beforehand focus on it but disable follow
  useEffect(() => {
    if (!selectorMode) return;
    if (selectedVehicle) {
      setFollowMode(false);
      focusMap(selectedVehicle.location.latitude, selectedVehicle.location.longitude);
    }
  }, [selectorMode, selectedVehicle]);

  useEffect(() => {
    if (
      !coordinates ||
      !user?.vehicleId ||
      connectionMode !== 'online' ||
      !operationalScheduleState.isWithinSchedule
    ) {
      return;
    }

    const now = Date.now();
    if (now - lastLocationSyncRef.current < LOCATION_SYNC_INTERVAL_MS) {
      return;
    }

    lastLocationSyncRef.current = now;
    sendVehicleLocation({
      vehicleId: user.vehicleId,
      coordinates,
      heading: coordinates.heading,
      speed: coordinates.speed,
      timestamp: lastUpdatedAt || new Date().toISOString(),
    }).catch(() => undefined);
  }, [connectionMode, coordinates, lastUpdatedAt, operationalScheduleState.isWithinSchedule, sendVehicleLocation, user?.vehicleId]);

  const handleRefresh = async () => {
    await Promise.all([refreshAll(), refresh()]);
  };

  function handleConfirmSelection() {
    if (!selectorPoints.origin || !selectorPoints.destination) return;

    const paramsToSet: Record<string, string> = {};
    const route = selectorPlan?.routes[0] || null;

    if (params.vehicleId) {
      paramsToSet.vehicleId = params.vehicleId;
    }
    paramsToSet.originLatitude = String(selectorPoints.origin.location.latitude);
    paramsToSet.originLongitude = String(selectorPoints.origin.location.longitude);
    paramsToSet.originAddress = selectorPoints.origin.address;
    paramsToSet.originLabel = selectorPoints.origin.label;
    paramsToSet.destinationLatitude = String(selectorPoints.destination.location.latitude);
    paramsToSet.destinationLongitude = String(selectorPoints.destination.location.longitude);
    paramsToSet.destinationAddress = selectorPoints.destination.address;
    paramsToSet.destinationLabel = selectorPoints.destination.label;

    if (selectorPlan && route) {
      paramsToSet.routeProvider = selectorPlan.provider;
      paramsToSet.routeDistanceMeters = String(route.distanceMeters);
      paramsToSet.routeDurationSeconds = String(route.durationSeconds);
      paramsToSet.routeDurationInTrafficSeconds = String(route.durationInTrafficSeconds);
      paramsToSet.routeTrafficLevel = route.trafficLevel;
      paramsToSet.routePolyline = JSON.stringify(route.polyline);
    }
    paramsToSet.stops = JSON.stringify(selectorStops);

    router.push({ pathname: params.returnTo || '/checklist', params: paramsToSet });
  }

  const selectorStep = !selectorPoints.origin
    ? 1
    : !selectorPoints.destination
      ? 2
      : 3;
  const selectorTitle =
    selectorStep === 1
      ? 'Selecciona el punto de inicio'
      : selectorStep === 2
        ? 'Selecciona el destino'
        : 'Deseas agregar paradas?';
  const selectorHint =
    selectorStep === 1
      ? 'Toca el mapa para fijar el origen de la ruta.'
      : selectorStep === 2
        ? 'Toca el mapa para fijar el destino y calcular la ruta.'
        : selectorStops.length
          ? 'Cada toque agrega otro waypoint. Puedes deshacer el ultimo o aceptar.'
          : 'Las paradas son opcionales. Toca el mapa para agregar una o acepta la ruta.';

  const handleResetSession = async () => {
    await signOut();
    router.replace('/login');
  };

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!mapData) {
    const resolution = resolveMobilePostLoginRoute({
      authContext,
      error: error && !authContext ? error : undefined,
      user,
    });
    const isBlocked = resolution.destination === 'PlanBlocked';
    const isOnboarding = resolution.destination === 'OperationalOnboarding';
    const isSyncError = !isBlocked && !isOnboarding;
    const recoveryTitle = isBlocked && resolution.reason === 'payment_pending'
      ? 'Pago pendiente'
      : isBlocked && resolution.reason === 'no_plan'
        ? 'Activa tu plan'
        : isBlocked && resolution.reason === 'missing_tenant'
          ? 'Completa tu configuración'
          : isBlocked
            ? 'Plan no activo'
            : isOnboarding
              ? 'Completa tu configuración'
              : 'No pudimos sincronizar tu cuenta';
    const recoveryMessage = isBlocked && resolution.reason === 'payment_pending'
      ? 'Tu pago aún no se ha confirmado. Revisa tu cuenta desde el portal web.'
      : isBlocked && resolution.reason === 'no_plan'
        ? 'Tu cuenta esta creada, pero aun no tienes un plan activo.'
        : isBlocked && resolution.reason === 'missing_tenant'
          ? 'Tu plan esta activo. Configura tu empresa para comenzar.'
        : isBlocked
          ? 'Renueva tu plan para volver a operar ManeComb.'
          : isOnboarding
            ? 'Tu plan esta activo. Configura tu empresa para comenzar.'
            : error || 'Revisa tu conexion e intenta de nuevo.';
    const primaryLabel = isBlocked && resolution.reason === 'payment_pending'
      ? 'Revisar pago'
      : isBlocked && resolution.reason === 'no_plan'
        ? 'Comprar plan'
        : isBlocked
          ? 'Renovar plan'
          : isOnboarding
            ? 'Continuar configuracion'
            : 'Reintentar';

    return (
      <View style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
        <StatusBar style={theme.statusBar} />
        <View style={styles.recoveryRoot}>
          <View
            style={[
              styles.recoveryIcon,
              {
                backgroundColor: theme.colors.accentSoft,
                borderColor: theme.colors.line,
              },
            ]}>
            <MaterialCommunityIcons name="map-marker-off-outline" size={30} color={theme.colors.accent} />
          </View>
          <Text style={[styles.recoveryTitle, { color: theme.colors.text }]}>{recoveryTitle}</Text>
          <Text style={[styles.recoveryMessage, { color: theme.colors.muted }]}>
            {recoveryMessage}
          </Text>
          <View style={styles.recoveryActions}>
            <Pressable
              onPress={() => {
                if (isBlocked) {
                  openSalesPortal(getSalesPortalPathForBlockReason(resolution.reason)).catch(() => undefined);
                  return;
                }

                if (isOnboarding) {
                  router.replace('/perfil-editar');
                  return;
                }

                handleRefresh();
              }}
              style={({ pressed }) => [
                styles.recoveryPrimaryButton,
                { backgroundColor: theme.colors.accent },
                pressed ? styles.recoveryPressed : undefined,
              ]}>
              <Text style={styles.recoveryPrimaryText}>{primaryLabel}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                handleRefresh();
              }}
              disabled={isRefreshing}
              style={({ pressed }) => [
                styles.recoverySecondaryButton,
                { borderColor: theme.colors.line, backgroundColor: theme.colors.surface },
                pressed && !isRefreshing ? styles.recoveryPressed : undefined,
                isRefreshing ? styles.recoveryDisabled : undefined,
              ]}>
              {isRefreshing ? (
                <MaterialCommunityIcons name="sync" size={18} color={theme.colors.accent} />
              ) : null}
              <Text style={[styles.recoverySecondaryText, { color: theme.colors.text }]}>
                {isRefreshing ? 'Sincronizando...' : isSyncError ? 'Sincronizar' : 'Reintentar'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                handleResetSession();
              }}
              style={({ pressed }) => [
                styles.recoveryGhostButton,
                pressed ? styles.recoveryPressed : undefined,
              ]}>
              <Text style={[styles.recoveryGhostText, { color: theme.colors.muted }]}>
                Reiniciar sesion
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.statusBar} />
      <View style={styles.root}>
        <AppMap
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: selectedVehicle?.location.latitude || mapData.center.latitude,
            longitude: selectedVehicle?.location.longitude || mapData.center.longitude,
            latitudeDelta: 0.08,
            longitudeDelta: 0.08,
          }}
          mapPadding={{
            top: insets.top + 110,
            right: 72,
            bottom: insets.bottom + 210,
            left: 12,
          }}
          compassEnabled
          scaleEnabled
          showsTraffic={trafficEnabled}
          themeMode={theme.mode}
          onPress={(e) => {
            if (!selectorMode) return;
            const { latitude, longitude } = e.nativeEvent.coordinate || {};
            if (typeof latitude === 'number' && typeof longitude === 'number') {
              handleSelectorPress({ latitude, longitude });
            }
          }}>
          {/** Map tap selection for Checklist when `point` param is present */}
          {selectorMode
            ? selectorRoute?.polyline?.length
              ? <AppMapPolyline id="selector-route" coordinates={selectorRoute.polyline} strokeColor={theme.colors.accent} strokeWidth={3} />
              : null
            : mapData.routes.map((route) => (
                <AppMapPolyline key={route.id} id={route.id} coordinates={route.polyline} strokeColor={route.color} strokeWidth={3} />
              ))}

          {mapData.vehicles.map((vehicle) => {
            const vehicleMarkerStyle = {
              backgroundColor: vehicle.status === 'maintenance' ? theme.colors.danger : theme.colors.accent,
            };

            return (
              <AppMapMarker
                key={vehicle.id}
                id={`vehicle-${vehicle.id}`}
                coordinate={vehicle.location}
                onPress={() => {
                  setSelectedVehicleId(vehicle.id);
                  setFollowMode(true);
                }}>
                <View style={[styles.vehicleMarker, vehicleMarkerStyle]}>
                   <View style={styles.vehicleMarkerInner} />
                </View>
              </AppMapMarker>
            );
          })}

          {mapData.incidents.map((incident) => {
            const v = mapData.vehicles.find(veh => veh.id === incident.vehicleId);
            if (!v) return null;
            return (
              <AppMapMarker key={incident.id} id={`incident-${incident.id}`} coordinate={v.location}>
                <View style={[styles.incidentMarker, { backgroundColor: incident.severity === 'critical' ? theme.colors.danger : theme.colors.warning }]}>
                  <MaterialCommunityIcons name="alert-decagram" size={14} color="#FFF" />
                </View>
              </AppMapMarker>
            );
          })}

          {selectorMode && selectorPoints.origin ? (
            <AppMapMarker
              id="selector-origin"
              coordinate={selectorPoints.origin.location}
              draggable
              onDragStart={() => setSelectorPlan(null)}
              onDragEnd={(event) => updateSelectorPoint('origin', event.nativeEvent.coordinate)}>
              <View style={[styles.vehicleMarker, { backgroundColor: theme.colors.success }]}>
                <MaterialCommunityIcons name="map-marker" size={22} color="#FFF" />
              </View>
            </AppMapMarker>
          ) : null}
          {selectorMode && selectorPoints.destination ? (
            <AppMapMarker
              id="selector-destination"
              coordinate={selectorPoints.destination.location}
              draggable
              onDragStart={() => setSelectorPlan(null)}
              onDragEnd={(event) => updateSelectorPoint('destination', event.nativeEvent.coordinate)}>
              <View style={[styles.vehicleMarker, { backgroundColor: theme.colors.danger }]}>
                <MaterialCommunityIcons name="map-marker" size={22} color="#FFF" />
              </View>
            </AppMapMarker>
          ) : null}
          {selectorMode
            ? selectorStops.map((stop, index) => (
                <AppMapMarker key={stop.id} id={`stop-${stop.id}`} coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}>
                  <View style={[styles.vehicleMarker, { backgroundColor: theme.colors.warning }]}>
                    <Text style={styles.stopMarkerText}>{index + 1}</Text>
                  </View>
                </AppMapMarker>
              ))
            : null}
          {coordinates && (
            <AppMapMarker id="user-location" coordinate={coordinates}>
               <View style={[styles.userMarker, { backgroundColor: theme.colors.info }]} />
            </AppMapMarker>
          )}
        </AppMap>

        {selectorMode ? (
          <View style={[styles.selectorPanel, { top: insets.top + 80, backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}>
            <View style={styles.selectorStepBadge}>
              <Text style={styles.selectorStepText}>Paso {selectorStep}</Text>
            </View>
            <View style={styles.selectorCopy}>
              <Text style={[styles.selectorTitle, { color: theme.colors.text }]}>{selectorTitle}</Text>
              <Text style={[styles.selectorHint, { color: theme.colors.muted }]}>{selectorHint}</Text>
            </View>
          </View>
        ) : null}

        {selectorMode && selectorPoints.origin && selectorPoints.destination ? (
          <View style={[styles.selectorConfirmWrap, { bottom: insets.bottom + 140 }]}>
            {selectorStops.length ? (
              <Pressable
                onPress={removeLastSelectorStop}
                style={[styles.selectorUndoButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}>
                <MaterialCommunityIcons name="undo" size={17} color={theme.colors.text} />
                <Text style={[styles.selectorUndoText, { color: theme.colors.text }]}>Deshacer ultima parada</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => handleConfirmSelection()}
              disabled={isPlanningSelectorRoute}
              style={({ pressed }) => [
                styles.selectorConfirmButton,
                { backgroundColor: pressed ? theme.colors.accentSoft : theme.colors.accent },
                isPlanningSelectorRoute ? styles.selectorConfirmDisabled : undefined,
              ]}>
              <MaterialCommunityIcons name="flag-checkered" size={18} color="#FFFFFF" />
              <Text style={styles.selectorConfirmText}>
                {isPlanningSelectorRoute ? 'Calculando ruta...' : 'Aceptar ruta'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* HUD Overlay */}
        <View style={[styles.topOverlay, { paddingTop: insets.top + 10 }]}>
           <View style={styles.topBar}>
              <Pressable onPress={() => router.push('/incidencias')} style={[styles.iconButton, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}>
                <MaterialCommunityIcons name="alert-outline" size={24} color={theme.colors.accent} />
              </Pressable>

              <View style={[styles.hud, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}>
                <HUDItem value={`${mapData.vehicles.filter(v => v.status === 'on-route').length}`} icon="bus" color={theme.colors.info} />
                <HUDItem value={`${mapData.incidents.length}`} icon="alert" color={theme.colors.danger} />
                <HUDItem value={locationStatus.hudLabel} icon="crosshairs-gps" color={locationStatusColor} />
                <HUDItem value={trafficEnabled ? 'ON' : 'OFF'} icon="traffic-light" color={trafficEnabled ? theme.colors.warning : theme.colors.muted} />
              </View>

              <Pressable onPress={() => setMenuOpen(true)} style={[styles.iconButton, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}>
                <MaterialCommunityIcons name="menu" size={24} color={theme.colors.text} />
              </Pressable>
           </View>
        </View>

        {/* Side Controls */}
        <View style={[styles.sideActions, { top: insets.top + 80 }]}>
          <Pressable onPress={handleRefresh} style={[styles.fab, { backgroundColor: theme.colors.headerGlass, borderColor: theme.colors.line }]}>
            <MaterialCommunityIcons name={isRefreshing ? "sync" : "refresh"} size={22} color={theme.colors.text} />
          </Pressable>
          <Pressable onPress={() => setFollowMode(!followMode)} style={[styles.fab, { backgroundColor: followMode ? theme.colors.accent : theme.colors.headerGlass, borderColor: theme.colors.line }]}>
            <MaterialCommunityIcons name={followMode ? "navigation" : "map-search"} size={22} color={followMode ? "#FFF" : theme.colors.text} />
          </Pressable>
          <Pressable onPress={() => setTrafficEnabled((current) => !current)} style={[styles.fab, { backgroundColor: trafficEnabled ? theme.colors.warning : theme.colors.headerGlass, borderColor: theme.colors.line }]}>
            <MaterialCommunityIcons name="traffic-light" size={22} color={trafficEnabled ? "#FFF" : theme.colors.text} />
          </Pressable>
          <Pressable onPress={focusNextAlert} style={[styles.fab, { backgroundColor: visibleIncidents.length ? theme.colors.danger : theme.colors.headerGlass, borderColor: theme.colors.line }]}>
            <MaterialCommunityIcons name="alert-decagram" size={22} color={visibleIncidents.length ? "#FFF" : theme.colors.text} />
          </Pressable>
          {locationStatus.canRetry && (
            <Pressable onPress={refresh} style={[styles.fab, { backgroundColor: theme.colors.warning, borderColor: theme.colors.line }]}>
              <MaterialCommunityIcons name="crosshairs-gps" size={22} color="#FFF" />
            </Pressable>
          )}
        </View>

        {/* Bottom HUD */}
        <View style={[styles.bottomOverlay, { paddingBottom: insets.bottom + 10 }]}>
          {locationStatus.canRetry && locationStatus.title ? (
            <View style={[styles.locationNotice, { backgroundColor: theme.colors.surface, borderColor: locationStatusColor }]}>
              <MaterialCommunityIcons name="crosshairs-gps" size={20} color={locationStatusColor} />
              <View style={styles.locationNoticeCopy}>
                <Text style={[styles.locationNoticeTitle, { color: theme.colors.text }]}>
                  {locationStatus.title}
                </Text>
                {locationStatus.message ? (
                  <Text style={[styles.locationNoticeText, { color: theme.colors.muted }]}>
                    {locationStatus.message}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={refresh}
                style={[styles.locationRetry, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.line }]}
                accessibilityLabel="Reintentar ubicacion">
                <MaterialCommunityIcons name="refresh" size={18} color={theme.colors.text} />
              </Pressable>
            </View>
          ) : null}
          <View style={[styles.followCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}>
             <View style={styles.followHeader}>
                <View>
                  <Text style={[styles.followTitle, { color: theme.colors.text }]}>{selectedVehicle?.code || 'Flota'}</Text>
                  <Text style={[styles.followMeta, { color: theme.colors.muted }]}>{selectedVehicle?.driverName || 'En monitoreo'}</Text>
                </View>
                <StatusPill label={`${selectedVehicle?.speed || 0} km/h`} tone="info" />
             </View>

             {activeIncident && activeIncidentVehicle ? (
               <Pressable
                 onPress={() => {
                   setSelectedVehicleId(activeIncidentVehicle.id);
                   setFollowMode(false);
                   focusMap(activeIncidentVehicle.location.latitude, activeIncidentVehicle.location.longitude, 'close');
                 }}
                 style={[styles.alertStrip, { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger }]}>
                 <MaterialCommunityIcons name="alert-decagram" size={18} color="#FFF" />
                 <View style={styles.alertCopy}>
                   <Text style={styles.alertTitle}>{activeIncident.title}</Text>
                   <Text style={styles.alertMeta}>{activeIncidentVehicle.code} - {activeIncident.status}</Text>
                 </View>
               </Pressable>
             ) : null}

             <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trackList}>
                {trackingVehicles.map((v) => {
                  const isSelected = v.id === selectedVehicle?.id;
                  const selectedTrackChipStyle = {
                    backgroundColor: theme.colors.accent,
                    borderColor: theme.colors.accent,
                  };
                  const trackChipTitleStyle = isSelected ? styles.trackChipTitleSelected : { color: theme.colors.text };

                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => {
                        setSelectedVehicleId(v.id);
                        setFollowMode(true);
                      }}
                      style={[styles.trackChip, isSelected ? selectedTrackChipStyle : undefined]}>
                      <Text style={[styles.trackChipTitle, trackChipTitleStyle]}>{v.code}</Text>
                    </Pressable>
                  );
                })}
             </ScrollView>
          </View>
        </View>

        <OperationalMenuDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} activeKey="mapa" />
      </View>
    </View>
  );
}

function HUDItem({ value, icon, color }: { value: string, icon: keyof typeof MaterialCommunityIcons.glyphMap, color: string }) {
  const { theme } = useAppTheme();
  return (
    <View style={styles.hudItem}>
      <MaterialCommunityIcons name={icon} size={14} color={color} />
      <Text style={[styles.hudValue, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  root: { flex: 1 },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, zIndex: 10 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 0 },
  iconButton: { width: 52, height: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  hud: { flex: 1, height: 52, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', minWidth: 0, paddingHorizontal: 12 },
  hudItem: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 6, minWidth: 0 },
  hudValue: { flexShrink: 1, fontSize: 15, fontWeight: '800', fontFamily: Typography.mono, minWidth: 0 },
  sideActions: { position: 'absolute', right: 16, gap: 12, zIndex: 10 },
  fab: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  selectorPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 30,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    elevation: 8,
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  selectorStepBadge: {
    minWidth: 62,
    minHeight: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF2FF',
  },
  selectorStepText: {
    color: '#1473E6',
    fontSize: 12,
    fontWeight: '900',
    fontFamily: Typography.body,
  },
  selectorCopy: { flex: 1, minWidth: 0, gap: 2 },
  selectorTitle: { fontSize: 15, fontWeight: '900', fontFamily: Typography.display },
  selectorHint: { fontSize: 12, lineHeight: 17, fontFamily: Typography.body },
  selectorConfirmWrap: { position: 'absolute', left: 16, right: 16, zIndex: 30 },
  selectorUndoButton: {
    minHeight: 44,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  selectorUndoText: { fontSize: 13, fontWeight: '900', fontFamily: Typography.body },
  selectorConfirmButton: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
  },
  selectorConfirmDisabled: { opacity: 0.78 },
  selectorConfirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', fontFamily: Typography.body },
  bottomOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, gap: 10, paddingHorizontal: 16, zIndex: 10 },
  locationNotice: {
    alignSelf: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 440,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '100%',
  },
  locationNoticeCopy: { flex: 1, gap: 2, minWidth: 0 },
  locationNoticeTitle: { flexShrink: 1, fontSize: 13, fontWeight: '900', fontFamily: Typography.body, minWidth: 0 },
  locationNoticeText: { flexShrink: 1, fontSize: 11, lineHeight: 15, fontFamily: Typography.body, minWidth: 0 },
  locationRetry: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  followCard: { borderRadius: 24, borderWidth: 1, padding: 16, gap: 12, elevation: 8, shadowOpacity: 0.15, shadowRadius: 10 },
  followHeader: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', minWidth: 0 },
  followTitle: { flexShrink: 1, fontSize: 22, fontWeight: '800', fontFamily: Typography.display, minWidth: 0 },
  followMeta: { fontSize: 13, fontFamily: Typography.body, minWidth: 0 },
  alertStrip: {
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  alertCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  alertTitle: {
    color: '#FFF',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
    fontFamily: Typography.body,
    minWidth: 0,
  },
  alertMeta: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    fontFamily: Typography.body,
  },
  trackList: { gap: 10 },
  trackChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  trackChipTitle: { fontSize: 14, fontWeight: '700', fontFamily: Typography.body },
  trackChipTitleSelected: { color: '#FFF' },
  vehicleMarker: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  vehicleMarkerInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF' },
  incidentMarker: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  userMarker: { width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: '#FFF' },
  stopMarkerText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', fontFamily: Typography.body },
  recoveryRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 28,
  },
  recoveryIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recoveryTitle: {
    fontFamily: Typography.display,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  recoveryMessage: {
    maxWidth: 420,
    fontFamily: Typography.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  recoveryActions: {
    width: '100%',
    maxWidth: 320,
    gap: 10,
    marginTop: 8,
  },
  recoveryPrimaryButton: {
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  recoveryPrimaryText: {
    color: '#FFF',
    fontFamily: Typography.body,
    fontSize: 15,
    fontWeight: '800',
  },
  recoverySecondaryButton: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  recoverySecondaryText: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '700',
  },
  recoveryGhostButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  recoveryGhostText: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '700',
  },
  recoveryPressed: {
    opacity: 0.86,
  },
  recoveryDisabled: {
    opacity: 0.64,
  },
});
