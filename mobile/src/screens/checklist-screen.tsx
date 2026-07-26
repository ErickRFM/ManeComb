import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Redirect, router, useLocalSearchParams } from '@/src/navigation/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  State as GestureState,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { useShallow } from 'zustand/react/shallow';
import { DesignSystem } from '@/constants/theme';
import { AppCard } from '@/src/components/app-card';
import { EmptyStateBox } from '@/src/components/empty-state-box';
import { KeyboardSafeView } from '@/src/components/keyboard-safe-layout';
import { AppShell } from '@/src/components/app-shell';
import { StatusPill } from '@/src/components/status-pill';
import { driverLabel } from '@shared/operational-contract';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { assignVehicleRouteRequest, createNavigationRouteRequest, deleteNavigationRouteRequest, getActiveRouteSessionRequest, getRouteSessionHistoryRequest, reverseNavigationPlaceRequest, updateNavigationRouteRequest } from '@/src/api/client';
import { usePointToPointTracker } from '@/src/hooks/use-point-to-point-tracker';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type {
  AssignedRoute,
  FleetControlLog,
  NavigationPlan,
  NavigationPlaceResult,
  RouteShape,
  RouteSession,
  Vehicle,
} from '@/src/types/app';
import { formatTime } from '@/src/utils/format';
import { normalizeAssignedRoute } from '@/src/utils/navigation-data';
import {
  buildAssignedRouteSelection,
  buildOperationalRecord,
  buildRouteStops,
  buildSavedRouteSelection,
  formatDistance,
  formatDuration,
  getActiveLog,
  getLatestLog,
  getPlaceLabel,
  getRouteSignature,
  getSafeLabel,
  getStatusColor,
  getStatusLabel,
  getStatusTone,
  getStopLabel,
  getStopsSignature,
  parseRoutePolylineParam,
  parseStopsParam,
  type OperationalRecord,
} from './checklist/checklist.utils';
import { createStyles } from './checklist/checklist-screen.styles';
import { RoutePreview } from './checklist/components/route-preview';

export { buildOperationalRecord, createStyles, getActiveLog, getLatestLog };

type FilterMode = 'all' | 'active' | 'routes' | 'completed' | 'cancelled';
type PointRole = 'origin' | 'destination';
type MapPointRole = PointRole | 'stop';
type RouteUiState = 'empty' | 'editing' | 'ready' | 'navigation' | 'paused';
export function ChecklistScreen() {
  const { theme } = useAppTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < DesignSystem.breakpoints.compact;
  const isPhone = width < DesignSystem.breakpoints.phone;
  const { activeRouteSession: syncedActiveSession, coordinates, mapData, operationalUnits, refreshAll, sessionHistory, user } = useAppStore(
    useShallow((state) => ({
      mapData: state.mapData,
      operationalUnits: state.operationalUnits,
      activeRouteSession: state.activeRouteSession,
      coordinates: state.deviceLocation.coordinates,
      refreshAll: state.refreshAll,
      sessionHistory: state.routeSessionHistory,
      user: state.user,
    }))
  );
  const params = useLocalSearchParams();
  const returnedFilter = ['all', 'active', 'routes', 'completed', 'cancelled'].includes(String(params.returnFilter))
    ? params.returnFilter as FilterMode
    : 'all';
  const returnedScrollY = Math.max(0, Number(params.historyScrollY) || 0);
  const hasReturnedMapDraft = Boolean(params.originLatitude || params.destinationLatitude || params.routePolyline);
  // When we re-enter the screen asking to land directly on the saved-routes list
  // (after saving a route, or after backing out of the map selector) the panel
  // must reopen on that list instead of the previous editing step.
  const shouldOpenLibrary = String(params.openLibrary || '') === '1';
  const historyScrollYRef = useRef(returnedScrollY);
  const [filterMode, setFilterMode] = useState<FilterMode>(returnedFilter);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [routeModalOpen, setRouteModalOpen] = useState(hasReturnedMapDraft || shouldOpenLibrary);
  const [isSavingAssignedRoute, setIsSavingAssignedRoute] = useState(false);
  const [routeNameDraft, setRouteNameDraft] = useState(String(params.routeNameDraft || ''));
  const [routePendingDelete, setRoutePendingDelete] = useState<RouteShape | null>(null);
  const [isDeletingRoute, setIsDeletingRoute] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(String(params.editingRouteId || '').trim() || null);
  const [isCreatingRouteDraft, setIsCreatingRouteDraft] = useState(hasReturnedMapDraft && !params.editingRouteId);
  const [routeLibraryOpen, setRouteLibraryOpen] = useState(shouldOpenLibrary);
  const [activeSession, setActiveSession] = useState<RouteSession | null>(null);
  const [historyLoadError, setHistoryLoadError] = useState(false);
  const styles = useMemo(() => createStyles(theme, isCompact, isPhone), [theme, isCompact, isPhone]);

  const vehicles = useMemo(
    () => [...(mapData?.vehicles || [])]
      .sort((left, right) => left.code.localeCompare(right.code)),
    [mapData?.vehicles]
  );
  const savedRoutes = useMemo(
    () => [...(mapData?.routes || [])].sort((left, right) => left.name.localeCompare(right.name)),
    [mapData?.routes]
  );
  // Identidad y conductor se resuelven desde el snapshot canonico, igual que en
  // el resto de la pantalla. Un unico constructor para toda la superficie.
  const unitById = useMemo(
    () => new Map(operationalUnits.map((unit) => [unit.unitId, unit])),
    [operationalUnits]
  );
  const persistentLogs = useMemo<FleetControlLog[]>(
    () => {
      const toLog = (session: RouteSession, status: 'active' | 'completed' | 'cancelled'): FleetControlLog => {
        const unit = unitById.get(session.vehicleId) || null;
        return {
          id: session.id,
          vehicleId: session.vehicleId,
          vehicleCode: unit?.label || session.vehicleId,
          driverName: driverLabel(unit?.driver ?? null),
          departureAt: session.startedAt,
          arrivalAt: session.finishedAt,
          status,
        };
      };

      const logs: FleetControlLog[] = sessionHistory.map((session) =>
        toLog(
          session,
          session.status === 'FINISHED'
            ? 'completed'
            : session.status === 'CANCELLED'
              ? 'cancelled'
              : 'active'
        )
      );

      if (activeSession?.id?.startsWith('pending:')) {
        logs.unshift(toLog(activeSession, 'active'));
      }

      return logs;
    },
    [sessionHistory, unitById, activeSession]
  );
  const loadSessionHistory = useCallback(async () => {
    try {
      useAppStore.setState({ routeSessionHistory: await getRouteSessionHistoryRequest({ limit: 500 }) });
      setHistoryLoadError(false);
    } catch {
      setHistoryLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (user) loadSessionHistory();
  }, [loadSessionHistory, user, syncedActiveSession]);
  const selectedVehicle =
    vehicles.find((vehicle) => vehicle.id === selectedVehicleId) || vehicles[0] || null;
  const selectedAssignedRoute = useMemo<AssignedRoute | null>(
    () => normalizeAssignedRoute(selectedVehicle?.assignedRoute),
    [selectedVehicle?.assignedRoute]
  );
  const trackedLocation =
    user?.vehicleId && selectedVehicle?.id === user.vehicleId && coordinates
      ? coordinates
      : selectedVehicle?.location || coordinates || null;
  const tracker = usePointToPointTracker({
    searchAnchor: selectedVehicle?.location || coordinates || null,
    selectedVehicle,
    trackedLocation,
  });
  const trackerRef = useRef(tracker);
  const syncedVehicleRouteRef = useRef<string | null>(null);
  const pendingStopPersistRef = useRef(false);
  const processedMapSelectionRef = useRef<string | null>(null);
  const restoredSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedVehicle?.id) { setActiveSession(null); return; }
    let cancelled = false;
    restoredSessionIdRef.current = null;
    getActiveRouteSessionRequest(selectedVehicle.id)
      .then((session) => {
        if (!cancelled) setActiveSession(session);
      })
      .catch(() => {
        if (!cancelled) setActiveSession(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedVehicle?.id]);

  useEffect(() => {
    if (syncedActiveSession?.vehicleId === selectedVehicle?.id) setActiveSession(syncedActiveSession);
  }, [selectedVehicle?.id, syncedActiveSession]);

  useEffect(() => {
    if (!activeSession || !selectedAssignedRoute || restoredSessionIdRef.current === activeSession.id) return;
    restoredSessionIdRef.current = activeSession.id;
    tracker.restoreTrackerSession({
      startedAt: activeSession.startedAt,
      status: activeSession.status === 'PAUSED' ? 'PAUSED' : 'RUNNING',
      vehicleId: activeSession.vehicleId,
    });
  }, [activeSession, selectedAssignedRoute, tracker, tracker.restoreTrackerSession]);

  useEffect(() => {
    trackerRef.current = tracker;
  }, [tracker]);

  useEffect(() => {
    if (
      !routeModalOpen ||
      !selectedVehicle ||
      editingRouteId ||
      isCreatingRouteDraft
    ) {
      return;
    }

    const assignedRoute = normalizeAssignedRoute(selectedVehicle.assignedRoute);
    const assignedAt = assignedRoute?.assignedAt || 'empty';
    const syncKey = `${selectedVehicle.id}:${assignedAt}`;

    if (syncedVehicleRouteRef.current === syncKey) {
      return;
    }

    syncedVehicleRouteRef.current = syncKey;
    const assignedSelection = buildAssignedRouteSelection(selectedVehicle);

    if (assignedSelection) {
      trackerRef.current.applyPointToPointSelection(
        assignedSelection.origin,
        assignedSelection.destination,
        assignedSelection.plan,
        assignedSelection.plan.stops || []
      );
      return;
    }

    trackerRef.current.resetPointToPointSession();
  }, [editingRouteId, isCreatingRouteDraft, routeModalOpen, selectedVehicle]);

  useEffect(() => {
    const requestedVehicleId = String(params.vehicleId || '').trim();
    if (requestedVehicleId && vehicles.some((vehicle) => vehicle.id === requestedVehicleId)) {
      setSelectedVehicleId(requestedVehicleId);
    }
  }, [params.vehicleId, vehicles]);

  const routeOption = tracker.pointPlan?.routes[0] || selectedAssignedRoute?.route || null;
  const routeStops = useMemo(
    () => buildRouteStops(tracker.pointSelection.origin, tracker.pointSelection.destination, routeOption, tracker.pointStops),
    [routeOption, tracker.pointSelection.destination, tracker.pointSelection.origin, tracker.pointStops]
  );
  const routeDistanceMeters = routeOption?.distanceMeters || 0;
  const routeDurationSeconds =
    routeOption?.durationInTrafficSeconds || routeOption?.durationSeconds || 0;
  const activeRouteSignature = getRouteSignature({
    destination: tracker.pointSelection.destination?.location,
    distanceMeters: tracker.pointPlan?.routes[0]?.distanceMeters,
    origin: tracker.pointSelection.origin?.location,
    polyline: tracker.pointPlan?.routes[0]?.polyline,
    stops: tracker.pointStops,
  });
  const savedRouteSignature = getRouteSignature({
    destination: selectedAssignedRoute?.destination,
    distanceMeters: selectedAssignedRoute?.route.distanceMeters,
    origin: selectedAssignedRoute?.origin,
    polyline: selectedAssignedRoute?.route.polyline,
    stops: selectedAssignedRoute?.stops || [],
  });
  const isCalculatedRouteSaved = Boolean(
    tracker.pointPlan &&
    selectedAssignedRoute &&
    activeRouteSignature === savedRouteSignature
  );
  const routeProgress = tracker.routeProgress?.progressPercent || 0;
  const waypointCount = tracker.pointStops.length;
  const isRoutePaused = tracker.trackerStatus === 'paused';
  const isRouteOffRoute = tracker.trackerStatus === 'off_route' || Boolean(tracker.routeProgress?.isOffRoute);
  const isRouteRunning =
    tracker.trackerStatus === 'waiting_start' ||
    tracker.trackerStatus === 'in_progress' ||
    tracker.trackerStatus === 'off_route';
  const routeUiState: RouteUiState = isRouteRunning
    ? 'navigation'
    : isRoutePaused
      ? 'paused'
      : editingRouteId || isCreatingRouteDraft
        ? 'editing'
      : isCalculatedRouteSaved
        ? 'ready'
          : 'empty';
  const routeStateLabel =
    isRouteOffRoute
      ? 'Fuera de ruta'
      : routeUiState === 'navigation'
      ? 'Ruta activa'
      : routeUiState === 'paused'
        ? 'Ruta pausada'
        : routeUiState === 'ready'
          ? 'Ruta lista'
          : routeUiState === 'editing'
            ? 'Editando ruta'
            : 'Sin ruta';
  const progressLabel =
    routeUiState === 'navigation' || routeUiState === 'paused'
      ? `${routeProgress}%`
      : routeUiState === 'ready'
        ? 'Preparada'
        : routeUiState === 'editing'
          ? 'Esperando guardado'
          : 'Pendiente';
  const remainingDistanceLabel =
    routeUiState === 'navigation' || routeUiState === 'paused'
      ? formatDistance(tracker.routeProgress?.distanceRemaining || routeDistanceMeters)
      : formatDistance(routeDistanceMeters);
  const dynamicEtaLabel =
    routeUiState === 'navigation' || routeUiState === 'paused'
      ? tracker.routeProgress?.timeRemainingSeconds
        ? formatDuration(tracker.routeProgress.timeRemainingSeconds)
        : routeDurationSeconds
          ? formatDuration(routeDurationSeconds)
          : 'No disponible'
      : routeDurationSeconds
        ? formatDuration(routeDurationSeconds)
        : 'No disponible';
  const checkpointProgressLabel = tracker.routeProgress
    ? `${tracker.routeProgress.currentCheckpointIndex} / ${tracker.routeProgress.checkpointCount}`
    : 'Pendiente';
  const originLabel = getPlaceLabel(tracker.pointSelection.origin, 'Punto inicial');
  const destinationLabel = getPlaceLabel(tracker.pointSelection.destination, 'Punto final');
  const routeHeaderSubtitle =
    routeUiState === 'empty'
      ? 'Gestion de rutas'
      : `${originLabel} - ${destinationLabel}`;

  // Se recorre el inventario canonico, no la lista de vehiculos: asi una unidad
  // recien dada de alta o sin GPS aparece igual que las demas.
  const records = useMemo(
    () =>
      operationalUnits
        .filter((unit) => unit.visibility === 'visible')
        .map((unit) => {
          const vehicle = vehicles.find((entry) => entry.id === unit.unitId);
          return vehicle ? buildOperationalRecord(unit, vehicle, persistentLogs) : null;
        })
        .filter((record): record is OperationalRecord => record !== null),
    [operationalUnits, persistentLogs, vehicles]
  );
  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        const matchesFilter =
          filterMode === 'all' ||
          (filterMode === 'active' && ['active', 'delayed'].includes(record.status)) ||
          (filterMode === 'completed' && record.lastRouteStatus === 'completed') ||
          (filterMode === 'cancelled' && record.lastRouteStatus === 'cancelled') ||
          (filterMode === 'routes' && Boolean(normalizeAssignedRoute(record.vehicle.assignedRoute)));

        return matchesFilter;
      }),
    [filterMode, records]
  );

  const openRouteModal = (vehicle: Vehicle) => {
    setSelectedVehicleId(vehicle.id);
    setRouteNameDraft('');
    setEditingRouteId(null);
    setIsCreatingRouteDraft(false);
    setRouteLibraryOpen(false);
    setRouteModalOpen(true);
  };

  const closeRouteModal = useCallback(() => {
    const trackerState = trackerRef.current;
    const hasSavedRoute = Boolean(selectedAssignedRoute);
    const hasActiveTracking = trackerState.trackerStatus !== 'off';

    if (!hasSavedRoute && !hasActiveTracking) {
      trackerState.resetPointToPointSession();
      syncedVehicleRouteRef.current = selectedVehicle ? `${selectedVehicle.id}:empty` : null;
    }

    setRouteModalOpen(false);
    setRouteNameDraft('');
    setEditingRouteId(null);
    setIsCreatingRouteDraft(false);
    setRouteLibraryOpen(false);
  }, [selectedAssignedRoute, selectedVehicle]);

  const routeSheetTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (routeModalOpen) {
      routeSheetTranslateY.setValue(0);
    }
  }, [routeModalOpen, routeSheetTranslateY]);

  const dismissRouteSheet = useCallback(() => {
    Animated.timing(routeSheetTranslateY, {
      toValue: 640,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        closeRouteModal();
        routeSheetTranslateY.setValue(0);
      }
    });
  }, [closeRouteModal, routeSheetTranslateY]);

  const handleRouteSheetGesture = useCallback(
    ({ nativeEvent }: PanGestureHandlerStateChangeEvent) => {
      if (nativeEvent.oldState !== GestureState.ACTIVE) return;

      if (nativeEvent.translationY > 110 || nativeEvent.velocityY > 850) {
        dismissRouteSheet();
        return;
      }

      Animated.timing(routeSheetTranslateY, {
        toValue: 0,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [dismissRouteSheet, routeSheetTranslateY]
  );

  const routeSheetVisualTranslateY = useMemo(
    () => routeSheetTranslateY.interpolate({
      inputRange: [0, 640],
      outputRange: [0, 640],
      extrapolate: 'clamp',
    }),
    [routeSheetTranslateY]
  );

  const routeSheetGestureEvent = useMemo(
    () => Animated.event<PanGestureHandlerGestureEvent>(
      [{ nativeEvent: { translationY: routeSheetTranslateY } }],
      { useNativeDriver: true }
    ),
    [routeSheetTranslateY]
  );

  const cancelRouteDraft = () => {
    const trackerState = trackerRef.current;
    const assignedSelection = selectedVehicle ? buildAssignedRouteSelection(selectedVehicle) : null;

    pendingStopPersistRef.current = false;
    setRouteNameDraft('');
    setEditingRouteId(null);
    setIsCreatingRouteDraft(false);
    setRouteLibraryOpen(false);
    if (assignedSelection) {
      trackerState.applyPointToPointSelection(
        assignedSelection.origin,
        assignedSelection.destination,
        assignedSelection.plan,
        assignedSelection.plan.stops || []
      );
      syncedVehicleRouteRef.current = `${selectedVehicle!.id}:${assignedSelection.plan.updatedAt}`;
    } else if (trackerState.trackerStatus === 'off') {
      trackerState.resetPointToPointSession();
      syncedVehicleRouteRef.current = selectedVehicle ? `${selectedVehicle.id}:empty` : null;
    }
    closeRouteModal();
    router.replace({
      pathname: '/checklist',
      params: {
        returnFilter: filterMode,
        historyScrollY: String(historyScrollYRef.current),
      },
    });
  };

  // Step back from the create/edit view to the saved-routes list without closing
  // the panel. Used by the Android hardware-back handler so the panel honours its
  // own internal stack (edit/create -> savedRoutes -> close).
  const goBackToLibrary = useCallback(() => {
    const trackerState = trackerRef.current;
    const assignedSelection = selectedVehicle ? buildAssignedRouteSelection(selectedVehicle) : null;

    pendingStopPersistRef.current = false;
    processedMapSelectionRef.current = null;
    setRouteNameDraft('');
    setEditingRouteId(null);
    setIsCreatingRouteDraft(false);
    setRouteLibraryOpen(true);
    if (assignedSelection) {
      trackerState.applyPointToPointSelection(
        assignedSelection.origin,
        assignedSelection.destination,
        assignedSelection.plan,
        assignedSelection.plan.stops || []
      );
      syncedVehicleRouteRef.current = `${selectedVehicle!.id}:${assignedSelection.plan.updatedAt}`;
    } else if (trackerState.trackerStatus === 'off') {
      trackerState.resetPointToPointSession();
      syncedVehicleRouteRef.current = selectedVehicle ? `${selectedVehicle.id}:empty` : null;
    }
    trackerState.setPointMessage('');
  }, [selectedVehicle]);

  // Hardware back / request-close: walk the panel's internal stack instead of
  // dismissing everything at once. From create/edit -> savedRoutes; from
  // savedRoutes or detail -> close the panel back to the Checklist.
  const handlePanelBack = useCallback(() => {
    if (editingRouteId || isCreatingRouteDraft) {
      goBackToLibrary();
      return true;
    }
    closeRouteModal();
    return true;
  }, [closeRouteModal, editingRouteId, goBackToLibrary, isCreatingRouteDraft]);

  function openMapForVehicle(vehicle: Vehicle, point: MapPointRole, includeCurrentDraft = true) {
    processedMapSelectionRef.current = null;
    const routeParams: Record<string, string> = {
      vehicleId: vehicle.id,
      follow: 'true',
      point,
      returnTo: '/checklist',
      returnFilter: filterMode,
      historyScrollY: String(historyScrollYRef.current),
      routeNameDraft: includeCurrentDraft ? routeNameDraft : '',
    };
    if (includeCurrentDraft && editingRouteId) routeParams.editingRouteId = editingRouteId;
    const origin = tracker.pointSelection.origin;
    const destination = tracker.pointSelection.destination;

    if (includeCurrentDraft && origin) {
      routeParams.originLatitude = String(origin.location.latitude);
      routeParams.originLongitude = String(origin.location.longitude);
      routeParams.originAddress = origin.address;
      routeParams.originLabel = origin.label;
    }

    if (includeCurrentDraft && destination) {
      routeParams.destinationLatitude = String(destination.location.latitude);
      routeParams.destinationLongitude = String(destination.location.longitude);
      routeParams.destinationAddress = destination.address;
      routeParams.destinationLabel = destination.label;
    }

    routeParams.stops = JSON.stringify(includeCurrentDraft ? tracker.pointStops : []);

    router.push({
      pathname: '/mapa',
      params: routeParams,
    });
  }

  const createRouteFromMap = () => {
    if (!selectedVehicle) return;

    pendingStopPersistRef.current = false;
    setRouteNameDraft('');
    setEditingRouteId(null);
    setIsCreatingRouteDraft(true);
    setRouteLibraryOpen(false);
    trackerRef.current.resetPointToPointSession();
    openMapForVehicle(selectedVehicle, 'origin', false);
  };

  const editSavedRoute = useCallback(async (route: RouteShape) => {
    const selection = buildSavedRouteSelection(route);

    if (!selection) {
      trackerRef.current.setPointMessage('La ruta no contiene puntos suficientes para editarla.');
      return;
    }

    if (!route.originLabel || !route.destinationLabel) {
      try {
        const [originResponse, destinationResponse] = await Promise.all([
          reverseNavigationPlaceRequest(selection.origin.location),
          reverseNavigationPlaceRequest(selection.destination.location),
        ]);
        selection.origin = {
          ...originResponse.result,
          label: getSafeLabel(originResponse.result.label || originResponse.result.address, route.name),
          address: getSafeLabel(originResponse.result.address || originResponse.result.label, route.name),
        };
        selection.destination = {
          ...destinationResponse.result,
          label: getSafeLabel(destinationResponse.result.label || destinationResponse.result.address, route.name),
          address: getSafeLabel(destinationResponse.result.address || destinationResponse.result.label, route.name),
        };
      } catch {
        trackerRef.current.setPointMessage('No fue posible recuperar los nombres de origen y destino.');
        return;
      }
    }

    setEditingRouteId(route.id);
    setIsCreatingRouteDraft(false);
    setRouteNameDraft(route.name);
    setRouteLibraryOpen(false);
    trackerRef.current.applyPointToPointSelection(
      selection.origin,
      selection.destination,
      selection.plan,
      selection.plan.stops || []
    );
    trackerRef.current.setPointMessage('Modifica solo lo necesario y guarda los cambios.');
  }, []);

  const handleRemoveRouteStop = (stopId: string) => {
    pendingStopPersistRef.current = true;
    tracker.removeStop(stopId);
  };



  const saveAssignedRoute = useCallback(async () => {
    const trackerState = trackerRef.current;
    const origin = trackerState.pointSelection.origin;
    const destination = trackerState.pointSelection.destination;
    const route = trackerState.pointPlan?.routes[0] || null;
    const routeName = routeNameDraft.trim();

    if (!selectedVehicle?.id || !origin || !destination || !trackerState.pointPlan || !route) {
      trackerState.setPointMessage('Calcula la ruta antes de guardarla.');
      return;
    }

    if (!routeName) {
      trackerState.setPointMessage('Escribe el nombre de la ruta.');
      return;
    }

    setIsSavingAssignedRoute(true);
    try {
      const payload = {
        name: routeName,
        origin: origin.location,
        originLabel: getPlaceLabel(origin, ''),
        destination: destination.location,
        destinationLabel: getPlaceLabel(destination, ''),
        route,
        stops: trackerState.pointStops,
      };
      const savedRoute = editingRouteId
        ? await updateNavigationRouteRequest(editingRouteId, payload)
        : await createNavigationRouteRequest(payload);
      await assignVehicleRouteRequest({
        vehicleId: selectedVehicle.id,
        routeId: savedRoute.id,
      });
      await refreshAll();
      // Return to the saved-routes list in a single step, with the panel still
      // open and the freshly saved route present + marked as selected. We drop
      // the stale map-draft params (origin/destination/polyline/editingRouteId)
      // so a later remount cannot bounce the user back into "Editando ruta".
      pendingStopPersistRef.current = false;
      processedMapSelectionRef.current = null;
      trackerState.setPointMessage('');
      setRouteNameDraft('');
      setEditingRouteId(null);
      setIsCreatingRouteDraft(false);
      setRouteLibraryOpen(true);
      router.replace({
        pathname: '/checklist',
        params: {
          vehicleId: selectedVehicle.id,
          returnFilter: filterMode,
          historyScrollY: String(historyScrollYRef.current),
          openLibrary: '1',
          editingRouteId: '',
          originLatitude: '',
          originLongitude: '',
          destinationLatitude: '',
          destinationLongitude: '',
          routePolyline: '',
          stops: '',
        },
      });
    } catch {
      trackerState.setPointMessage('No fue posible guardar la ruta.');
    } finally {
      setIsSavingAssignedRoute(false);
    }
  }, [editingRouteId, filterMode, refreshAll, routeNameDraft, selectedVehicle?.id]);

  const assignSavedRoute = useCallback(async (route: RouteShape) => {
    if (!selectedVehicle?.id) {
      return;
    }

    setIsSavingAssignedRoute(true);
    try {
      await assignVehicleRouteRequest({
        vehicleId: selectedVehicle.id,
        routeId: route.id,
      });
      await refreshAll();
      trackerRef.current.setPointMessage(`Ruta ${route.name} asignada a la unidad.`);
      closeRouteModal();
    } catch {
      trackerRef.current.setPointMessage('No fue posible asignar la ruta.');
    } finally {
      setIsSavingAssignedRoute(false);
    }
  }, [closeRouteModal, refreshAll, selectedVehicle?.id]);

  const deleteSavedRoute = useCallback((route: RouteShape) => {
    setRoutePendingDelete(route);
  }, []);

  const confirmDeleteSavedRoute = useCallback(async () => {
    const route = routePendingDelete;
    if (!route || isDeletingRoute) return;

    setIsDeletingRoute(true);
    try {
      await deleteNavigationRouteRequest(route.id);
      useAppStore.setState((state) => ({
        mapData: state.mapData
          ? {
              ...state.mapData,
              routes: state.mapData.routes.filter((entry) => entry.id !== route.id),
              vehicles: state.mapData.vehicles.map((vehicle) =>
                vehicle.routeId === route.id
                  ? { ...vehicle, routeId: null, route: null, assignedRoute: null, routeName: undefined, routeCode: undefined }
                  : vehicle
              ),
            }
          : state.mapData,
      }));
      if (selectedVehicle?.routeId === route.id) {
        trackerRef.current.resetPointToPointSession();
        syncedVehicleRouteRef.current = `${selectedVehicle.id}:empty`;
      }
      setRoutePendingDelete(null);
      setEditingRouteId((current) => current === route.id ? null : current);
      setRouteLibraryOpen(true);
      trackerRef.current.setPointMessage(`Ruta ${route.name} eliminada.`);
    } catch {
      trackerRef.current.setPointMessage('No fue posible eliminar la ruta.');
    } finally {
      setIsDeletingRoute(false);
    }
  }, [isDeletingRoute, routePendingDelete, selectedVehicle]);

  const navParams = useLocalSearchParams<{
    vehicleId?: string;
    originLatitude?: string;
    originLongitude?: string;
    originAddress?: string;
    originLabel?: string;
    destinationLatitude?: string;
    destinationLongitude?: string;
    destinationAddress?: string;
    destinationLabel?: string;
    routeDistanceMeters?: string;
    routeDurationSeconds?: string;
    routeDurationInTrafficSeconds?: string;
    routePolyline?: string;
    routeProvider?: string;
    routeTrafficLevel?: string;
    stops?: string;
  }>();

  const { applyPointToPointSelection, selectPoint, planPointToPointRoute } = tracker;

  const originLatCurrent = tracker.pointSelection.origin?.location?.latitude ?? null;
  const originLonCurrent = tracker.pointSelection.origin?.location?.longitude ?? null;
  const destLatCurrent = tracker.pointSelection.destination?.location?.latitude ?? null;
  const destLonCurrent = tracker.pointSelection.destination?.location?.longitude ?? null;
  const hasPointPlan = Boolean(tracker.pointPlan);

  // Handle return values from MapScreen: create NavigationPlaceResult and delegate to tracker
  useEffect(() => {
    if (!routeModalOpen || !selectedVehicle) {
      return;
    }

    if (navParams.vehicleId && navParams.vehicleId !== selectedVehicle.id) {
      return;
    }

    const incomingSelectionKey = [
      navParams.vehicleId || selectedVehicle.id,
      navParams.originLatitude,
      navParams.originLongitude,
      navParams.destinationLatitude,
      navParams.destinationLongitude,
      navParams.routeDistanceMeters,
      navParams.routeDurationInTrafficSeconds,
      navParams.routePolyline,
      navParams.stops,
    ].join('|');

    if (processedMapSelectionRef.current === incomingSelectionKey) {
      return;
    }

    let nextOrigin: NavigationPlaceResult | null = null;
    let nextDestination: NavigationPlaceResult | null = null;

    try {
      const oLat = navParams.originLatitude ? Number(navParams.originLatitude) : NaN;
      const oLon = navParams.originLongitude ? Number(navParams.originLongitude) : NaN;

      if (Number.isFinite(oLat) && Number.isFinite(oLon)) {
        const label = getSafeLabel(navParams.originLabel || navParams.originAddress, 'Punto inicial');
        nextOrigin = {
          id: `map-origin-${oLat}-${oLon}`,
          label,
          address: getSafeLabel(navParams.originAddress || label, label),
          location: { latitude: oLat, longitude: oLon },
        };
      }
    } catch {
      // ignore malformed params
    }

    try {
      const dLat = navParams.destinationLatitude ? Number(navParams.destinationLatitude) : NaN;
      const dLon = navParams.destinationLongitude ? Number(navParams.destinationLongitude) : NaN;

      if (Number.isFinite(dLat) && Number.isFinite(dLon)) {
        const label = getSafeLabel(navParams.destinationLabel || navParams.destinationAddress, 'Punto final');
        nextDestination = {
          id: `map-destination-${dLat}-${dLon}`,
          label,
          address: getSafeLabel(navParams.destinationAddress || label, label),
          location: { latitude: dLat, longitude: dLon },
        };
      }
    } catch {
      // ignore malformed params
    }

    if (nextOrigin && nextDestination) {
      const polyline = parseRoutePolylineParam(navParams.routePolyline);
      const distanceMeters = Number(navParams.routeDistanceMeters);
      const durationSeconds = Number(navParams.routeDurationSeconds);
      const durationInTrafficSeconds = Number(navParams.routeDurationInTrafficSeconds);
      const trafficLevel =
        navParams.routeTrafficLevel === 'medium' || navParams.routeTrafficLevel === 'high'
          ? navParams.routeTrafficLevel
          : 'low';
      const hasRoute =
        polyline.length >= 2 &&
        Number.isFinite(distanceMeters) &&
        Number.isFinite(durationSeconds) &&
        Number.isFinite(durationInTrafficSeconds);
      const nextStops = parseStopsParam(navParams.stops);
      const plan: NavigationPlan | null = hasRoute
        ? {
            provider: (navParams.routeProvider || 'system') as NavigationPlan['provider'],
            origin: nextOrigin.location,
            destination: nextDestination.location,
            stops: nextStops,
            routes: [
              {
                label: routeNameDraft.trim() || `${nextOrigin.label} - ${nextDestination.label}`,
                distanceMeters,
                durationSeconds,
                durationInTrafficSeconds,
                trafficLevel,
                polyline,
              },
            ],
            updatedAt: new Date().toISOString(),
          }
        : null;

      const sameOrigin = originLatCurrent === nextOrigin.location.latitude && originLonCurrent === nextOrigin.location.longitude;
      const sameDestination =
        destLatCurrent === nextDestination.location.latitude && destLonCurrent === nextDestination.location.longitude;
      const sameStops = getStopsSignature(tracker.pointStops) === getStopsSignature(nextStops);

      if (!sameOrigin || !sameDestination || !sameStops || (plan && !hasPointPlan)) {
        if (!sameStops) {
          pendingStopPersistRef.current = true;
        }
        applyPointToPointSelection(nextOrigin, nextDestination, plan, nextStops);
      }

      processedMapSelectionRef.current = incomingSelectionKey;
      return;
    }

    if (nextOrigin && (originLatCurrent !== nextOrigin.location.latitude || originLonCurrent !== nextOrigin.location.longitude)) {
      selectPoint('origin', nextOrigin);
      processedMapSelectionRef.current = incomingSelectionKey;
    }

    if (
      nextDestination &&
      (destLatCurrent !== nextDestination.location.latitude || destLonCurrent !== nextDestination.location.longitude)
    ) {
      selectPoint('destination', nextDestination);
      processedMapSelectionRef.current = incomingSelectionKey;
    }

    if (tracker.pointSelection.origin && tracker.pointSelection.destination && !hasPointPlan) {
      planPointToPointRoute();
    }
  }, [
    // navigation inputs
    navParams.originLatitude,
    navParams.originLongitude,
    navParams.vehicleId,
    navParams.originAddress,
    navParams.originLabel,
    navParams.destinationLatitude,
    navParams.destinationLongitude,
    navParams.destinationAddress,
    navParams.destinationLabel,
    navParams.routeDistanceMeters,
    navParams.routeDurationInTrafficSeconds,
    navParams.routeDurationSeconds,
    navParams.routePolyline,
    navParams.routeProvider,
    navParams.routeTrafficLevel,
    navParams.stops,
    routeNameDraft,
    routeModalOpen,
    selectedVehicle,
    // tracker pieces we need to compare
    originLatCurrent,
    originLonCurrent,
    destLatCurrent,
    destLonCurrent,
    hasPointPlan,
    tracker.pointSelection.destination,
    tracker.pointSelection.origin,
    tracker.pointStops,
    // functions
    applyPointToPointSelection,
    selectPoint,
    planPointToPointRoute,
  ]);

  useEffect(() => {
    if (
      !pendingStopPersistRef.current ||
      !routeModalOpen ||
      !selectedVehicle ||
      !tracker.pointPlan ||
      isSavingAssignedRoute ||
      isCalculatedRouteSaved
    ) {
      return;
    }

    pendingStopPersistRef.current = false;
    tracker.setPointMessage('Asigna un nombre y guarda la ruta.');
  }, [
    activeRouteSignature,
    isCalculatedRouteSaved,
    isSavingAssignedRoute,
    routeModalOpen,
    selectedVehicle,
    tracker,
    tracker.pointPlan,
  ]);

  const openRouteLibrary = useCallback(() => {
    setEditingRouteId(null);
    setIsCreatingRouteDraft(false);
    setRouteNameDraft('');
    setRouteLibraryOpen(true);
  }, []);

  if (!user || !mapData) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
      </View>
    );
  }

  if (user.role === 'driver' || user.role === 'viewer' || user.role === 'support' || user.role === 'billing_manager' || user.role === 'dispatcher') {
    return <Redirect href="/mapa" />;
  }

  return (
    <AppShell
      sectionKey="checklist"
      mobileTitle="Checklist"
      scrollProps={{
        contentOffset: { x: 0, y: returnedScrollY },
        onScroll: (event) => {
          historyScrollYRef.current = event.nativeEvent.contentOffset.y;
        },
        scrollEventThrottle: 32,
      }}
      header={
        <View style={styles.header}>
          <Text style={styles.title}>Checklist</Text>
        </View>
      }>
      <View style={styles.filterFrame}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}>
          {[
            { id: 'all', label: 'Historial' },
            { id: 'active', label: 'En ruta' },
            { id: 'completed', label: 'Finalizadas' },
            { id: 'cancelled', label: 'Canceladas' },
            { id: 'routes', label: 'Rutas' },
          ].map((option) => {
            const isActive = filterMode === option.id;

            return (
              <Pressable
                key={option.id}
                onPress={() => setFilterMode(option.id as FilterMode)}
                style={[styles.filterSegment, isActive ? styles.filterSegmentActive : undefined]}>
                <Text
                  style={[styles.filterSegmentText, isActive ? styles.filterSegmentTextActive : undefined]}
                  numberOfLines={1}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <AppCard style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle} numberOfLines={2}>Registros operativos</Text>
          <Text style={styles.sectionLink} numberOfLines={1}>{filteredRecords.length} registros</Text>
        </View>

        {historyLoadError ? (
          <View style={styles.historyErrorBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color={theme.colors.warning} />
            <Text style={styles.historyErrorText}>Error al cargar historial.</Text>
            <Pressable onPress={loadSessionHistory}>
              <Text style={styles.historyRetryText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.recordsList}>
          {filteredRecords.length ? (
            filteredRecords.map((record) => {
              const statusColor = getStatusColor(theme, record.status);
              const lastRouteStatus = record.lastRouteStatus;
              const etaLabel =
                record.status === 'completed'
                  ? 'LLE'
                  : record.delayMinutes > 0
                    ? `ETA +${record.delayMinutes}`
                    : 'ETA';

              return (
                <View key={`${record.id}-${record.vehicleId}`} style={styles.recordCard}>
                  <View style={styles.recordMain}>
                    <View style={styles.recordLead}>
                      <View style={[styles.recordIcon, { backgroundColor: `${statusColor}18` }]}>
                        <MaterialCommunityIcons
                          name={
                            record.status === 'completed'
                              ? 'check-circle-outline'
                              : record.status === 'delayed'
                                ? 'clock-alert-outline'
                                : record.status === 'active'
                                  ? 'arrow-right-circle-outline'
                                  : 'bus'
                          }
                          size={24}
                          color={statusColor}
                        />
                      </View>
                      <View style={styles.recordCopy}>
                        <Text style={styles.recordTitle} numberOfLines={1} ellipsizeMode="tail">{record.vehicleCode}</Text>
                        <Text style={styles.recordDriver} numberOfLines={1}>
                          {record.driverName}
                        </Text>
                      </View>
                    </View>
                    {/*
                      Las pastillas viven en un contenedor con ancho acotado.
                      Sueltas, dos pastillas absorbian todo el espacio libre de la
                      fila y `recordCopy` —con minWidth: 0— se comprimia hasta
                      cero, dejando la unidad sin nombre visible.
                    */}
                    <View style={styles.recordPills}>
                      <StatusPill label={getStatusLabel(record.status)} tone={getStatusTone(record.status)} />
                      {lastRouteStatus ? (
                        <StatusPill
                          label={`Ultima ruta: ${getStatusLabel(lastRouteStatus)}`}
                          tone={getStatusTone(lastRouteStatus)}
                        />
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.recordTimeline}>
                    <View style={styles.timeBlock}>
                      <Text style={styles.timeLabel}>SAL</Text>
                      <Text style={styles.timeValue} numberOfLines={1} ellipsizeMode="tail">
                        {record.departureAt ? formatTime(record.departureAt) : 'Sin salida'}
                      </Text>
                    </View>
                    <View style={styles.timeBlock}>
                      <Text style={styles.timeLabel}>
                        {lastRouteStatus === 'cancelled' ? 'CAN' : etaLabel}
                      </Text>
                      <Text style={styles.timeValue} numberOfLines={1} ellipsizeMode="tail">
                        {record.arrivalAt
                          ? formatTime(record.arrivalAt)
                          : record.etaAt
                            ? formatTime(record.etaAt)
                            : 'Pendiente'}
                      </Text>
                    </View>
                    <View style={styles.timeBlock}>
                      <Text style={styles.timeLabel}>RUTA</Text>
                      <Text style={styles.timeValue} numberOfLines={1}>
                        {record.routeName}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.recordActions}>
                    <Pressable style={styles.miniAction} onPress={() => openRouteModal(record.vehicle)}>
                      <MaterialCommunityIcons name="map-marker-path" size={16} color={theme.colors.text} />
                      <Text style={styles.miniActionText}>Ruta</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          ) : (
            <EmptyStateBox icon="clipboard-check-outline" title="Sin registros" />
          )}
        </View>
      </AppCard>

      <Modal visible={routeModalOpen} transparent animationType="fade" onRequestClose={handlePanelBack}>
        <GestureHandlerRootView style={styles.modalBackdrop}>
          <KeyboardSafeView
            keyboardVerticalOffset={12}
            style={styles.modalKeyboard}>
          <Animated.View style={[styles.modalCard, { transform: [{ translateY: routeSheetVisualTranslateY }] }]}>
            <PanGestureHandler
              activeOffsetY={5}
              failOffsetX={[-24, 24]}
              onGestureEvent={routeSheetGestureEvent}
              onHandlerStateChange={handleRouteSheetGesture}>
              <Animated.View
                accessible
                accessibilityLabel="Desliza hacia abajo para cerrar"
                accessibilityRole="adjustable"
                style={styles.modalDragArea}>
                <View style={styles.modalDragHandle} />
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderCopy}>
                    <Text style={styles.modalTitle} numberOfLines={1} ellipsizeMode="tail">{selectedVehicle?.code || 'Ruta punto a punto'}</Text>
                    <Text style={styles.modalSubtitle} numberOfLines={2} ellipsizeMode="tail">{routeHeaderSubtitle}</Text>
                  </View>
                  <Pressable style={styles.modalClose} onPress={closeRouteModal}>
                    <MaterialCommunityIcons name="close" size={22} color={theme.colors.text} />
                  </Pressable>
                </View>
              </Animated.View>
            </PanGestureHandler>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
              {routeUiState === 'empty' || routeLibraryOpen ? (
                <View style={styles.configCard}>
                    {savedRoutes.length ? (
                      <View style={styles.savedRoutesList}>
                        <Text style={styles.fieldLabel}>Rutas guardadas</Text>
                        {savedRoutes.map((route) => {
                          const isAssigned = route.id === selectedVehicle?.routeId;
                          return (
                            <View key={route.id} style={styles.savedRouteRow}>
                              <Pressable
                                style={[
                                  styles.savedRouteButton,
                                  isAssigned ? styles.savedRouteButtonAssigned : undefined,
                                ]}
                                onPress={() => isAssigned ? null : assignSavedRoute(route)}
                                disabled={isSavingAssignedRoute || isAssigned}>
                                <MaterialCommunityIcons
                                  name={isAssigned ? "check-circle" : "routes"}
                                  size={17}
                                  color={isAssigned ? theme.colors.success : theme.colors.text}
                                />
                                <Text
                                  style={[
                                    styles.savedRouteName,
                                    isAssigned ? styles.savedRouteNameAssigned : undefined,
                                  ]}
                                  numberOfLines={1}>
                                  {route.name}
                                </Text>
                              </Pressable>
                              <Pressable
                                style={styles.savedRouteEdit}
                                onPress={() => editSavedRoute(route)}
                                disabled={isSavingAssignedRoute || isDeletingRoute}
                                accessibilityLabel={`Editar ruta ${route.name}`}>
                                <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.colors.text} />
                              </Pressable>
                              <Pressable
                                style={styles.savedRouteDelete}
                                onPress={() => deleteSavedRoute(route)}
                                disabled={isSavingAssignedRoute || isDeletingRoute}
                                accessibilityLabel={`Eliminar ruta ${route.name}`}>
                                <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.colors.danger} />
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                    <Pressable
                      style={styles.primaryWide}
                       onPress={createRouteFromMap}>
                      <MaterialCommunityIcons name="map-plus" size={18} color="#FFFFFF" />
                      <Text style={styles.primaryWideText}>Crear ruta</Text>
                    </Pressable>
                </View>
              ) : null}

              {routeUiState === 'editing' && !routeLibraryOpen ? (
                <>
                  <RoutePreview
                    points={routeStops}
                    route={routeOption}
                    vehicle={selectedVehicle}
                    onPress={() => selectedVehicle && openMapForVehicle(selectedVehicle, 'origin')}
                  />
                  {routeOption ? (
                    <View style={styles.routeSummary}>
                      <View style={styles.routeSummaryItem}>
                        <Text style={styles.summaryLabel}>Distancia</Text>
                        <Text style={styles.summaryValue} numberOfLines={2}>{formatDistance(routeDistanceMeters)}</Text>
                      </View>
                      <View style={styles.routeSummaryItem}>
                        <Text style={styles.summaryLabel}>Paradas</Text>
                        <Text style={styles.summaryValue}>{waypointCount}</Text>
                      </View>
                      <View style={styles.routeSummaryItem}>
                        <Text style={styles.summaryLabel}>Estimado</Text>
                        <Text style={styles.summaryValue} numberOfLines={2}>{dynamicEtaLabel}</Text>
                      </View>
                    </View>
                  ) : null}
                  <View style={styles.configCard}>
                    <View style={styles.configTitleRow}>
                      <Text style={styles.configTitle}>Editando ruta</Text>
                      <StatusPill label={routeStateLabel} tone="neutral" />
                    </View>
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Nombre de la ruta</Text>
                      <TextInput
                        value={routeNameDraft}
                        onChangeText={setRouteNameDraft}
                        placeholder="Ruta Centro"
                        placeholderTextColor={theme.colors.muted}
                        style={styles.routeNameInput}
                        autoCapitalize="words"
                        returnKeyType="done"
                      />
                    </View>
                    <View style={styles.routeEndpoints}>
                      <Text style={styles.fieldLabel}>Origen</Text>
                      <Text style={styles.endpointText} numberOfLines={1}>{originLabel}</Text>
                      <MaterialCommunityIcons name="arrow-down" size={18} color={theme.colors.muted} />
                      <Text style={styles.fieldLabel}>Destino</Text>
                      <Text style={styles.endpointText} numberOfLines={1}>{destinationLabel}</Text>
                    </View>
                    {waypointCount ? (
                      <View style={styles.compactStopsList}>
                        {tracker.pointStops.map((stop, index) => (
                          <View key={stop.id} style={styles.stopRow}>
                            <View style={styles.waypointNumber}>
                              <Text style={styles.stopNumberText}>{index + 1}</Text>
                            </View>
                            <View style={styles.stopCopy}>
                              <Text style={styles.stopTitle} numberOfLines={1}>
                                {getStopLabel(stop, index)}
                              </Text>
                            </View>
                            {editingRouteId ? <View style={styles.stopMoveGroup}>
                              <Pressable
                                style={[styles.stopMoveButton, index === 0 ? styles.stopMoveButtonDisabled : undefined]}
                                disabled={index === 0}
                                onPress={() => tracker.moveStop(stop.id, -1)}>
                                <MaterialCommunityIcons name="chevron-up" size={16} color={theme.colors.text} />
                              </Pressable>
                              <Pressable
                                style={[
                                  styles.stopMoveButton,
                                  index === waypointCount - 1 ? styles.stopMoveButtonDisabled : undefined,
                                ]}
                                disabled={index === waypointCount - 1}
                                onPress={() => tracker.moveStop(stop.id, 1)}>
                                <MaterialCommunityIcons name="chevron-down" size={16} color={theme.colors.text} />
                              </Pressable>
                              <Pressable style={styles.stopRemoveButton} onPress={() => handleRemoveRouteStop(stop.id)}>
                                <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.colors.danger} />
                              </Pressable>
                            </View> : null}
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {tracker.pointMessage ? <Text style={styles.messageText}>{tracker.pointMessage}</Text> : null}
                    <View style={styles.routeActionRow}>
                      <Pressable style={styles.secondaryWide} onPress={cancelRouteDraft}>
                        <MaterialCommunityIcons name="close" size={18} color={theme.colors.text} />
                        <Text style={styles.secondaryWideText}>Cancelar</Text>
                      </Pressable>
                      <Pressable
                        style={styles.secondaryWide}
                        onPress={() => selectedVehicle && openMapForVehicle(selectedVehicle, 'stop')}>
                        <MaterialCommunityIcons name="map-marker-plus-outline" size={18} color={theme.colors.text} />
                        <Text style={styles.secondaryWideText}>Abrir mapa</Text>
                      </Pressable>
                    </View>
                    <Pressable
                      style={styles.primaryWide}
                      onPress={
                        tracker.pointPlan
                          ? () => {
                              if (!routeNameDraft.trim()) {
                                tracker.setPointMessage('Escribe el nombre de la ruta.');
                                return;
                              }
                              saveAssignedRoute();
                            }
                          : () => selectedVehicle && openMapForVehicle(selectedVehicle, 'origin')
                      }
                      disabled={tracker.isPlanningPointRoute || isSavingAssignedRoute}>
                      {tracker.isPlanningPointRoute || isSavingAssignedRoute ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="content-save-check-outline" size={18} color="#FFFFFF" />
                          <Text style={styles.primaryWideText}>
                            {tracker.pointPlan
                              ? editingRouteId ? 'Guardar cambios' : 'Guardar ruta'
                              : 'Abrir mapa'}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </>
              ) : null}

              {routeUiState === 'ready' && !routeLibraryOpen ? (
                <>
                  <RoutePreview
                    points={routeStops}
                    route={routeOption}
                    vehicle={selectedVehicle}
                    onPress={() => selectedVehicle && openMapForVehicle(selectedVehicle, 'origin')}
                  />
                  <View style={styles.routeSummary}>
                    <View style={styles.routeSummaryItem}>
                      <Text style={styles.summaryLabel}>Distancia</Text>
                      <Text style={styles.summaryValue}>{formatDistance(routeDistanceMeters)}</Text>
                    </View>
                    <View style={styles.routeSummaryItem}>
                      <Text style={styles.summaryLabel}>Paradas</Text>
                      <Text style={styles.summaryValue}>{waypointCount}</Text>
                    </View>
                    <View style={styles.routeSummaryItem}>
                      <Text style={styles.summaryLabel}>Estimado</Text>
                      <Text style={styles.summaryValue}>{dynamicEtaLabel}</Text>
                    </View>
                  </View>
                  <View style={styles.configCard}>
                    <View style={styles.configTitleRow}>
                      <Text style={styles.configTitle}>Ruta lista</Text>
                      <StatusPill label={progressLabel} tone="positive" />
                    </View>
                    <View style={styles.routeActionRow}>
                      <Pressable style={styles.secondaryWide} onPress={openRouteLibrary}>
                        <MaterialCommunityIcons name="routes" size={18} color={theme.colors.text} />
                        <Text style={styles.secondaryWideText}>Seleccionar ruta</Text>
                      </Pressable>
                      {selectedVehicle?.routeId ? (
                        <Pressable
                          style={styles.secondaryWide}
                          onPress={() => {
                            const route = savedRoutes.find((entry) => entry.id === selectedVehicle.routeId);
                            if (route) editSavedRoute(route);
                          }}>
                          <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.colors.text} />
                          <Text style={styles.secondaryWideText}>Editar ruta</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </>
              ) : null}

              {routeUiState === 'navigation' || routeUiState === 'paused' ? (
                <>
                  <RoutePreview
                    points={routeStops}
                    route={routeOption}
                    vehicle={selectedVehicle}
                  />
                  <View style={styles.progressCard}>
                    <View style={styles.progressTop}>
                      <Text style={styles.progressTitle}>{routeUiState === 'paused' ? 'Ruta pausada' : 'En navegación'}</Text>
                      <Text style={styles.progressValue}>{progressLabel}</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${routeProgress}%` as any }]} />
                    </View>
                    <View style={styles.routeSummary}>
                      <View style={styles.routeSummaryItem}>
                        <Text style={styles.summaryLabel}>Restante</Text>
                        <Text style={styles.summaryValue}>{remainingDistanceLabel}</Text>
                      </View>
                      <View style={styles.routeSummaryItem}>
                        <Text style={styles.summaryLabel}>ETA</Text>
                        <Text style={styles.summaryValue}>{dynamicEtaLabel}</Text>
                      </View>
                      <View style={styles.routeSummaryItem}>
                        <Text style={styles.summaryLabel}>Checkpoints</Text>
                        <Text style={styles.summaryValue}>{checkpointProgressLabel}</Text>
                      </View>
                    </View>
                    {isRouteOffRoute ? (
                      <View style={styles.routeAlert}>
                        <MaterialCommunityIcons name="alert-outline" size={18} color={theme.colors.danger} />
                        <Text style={styles.routeAlertText}>
                          Desviacion detectada a {formatDistance(tracker.routeProgress?.distanceFromRoute || 0)} de la ruta.
                        </Text>
                      </View>
                    ) : null}
                    <Pressable
                      style={styles.primaryWide}
                      onPress={() => {
                        const labels = tracker.pointStops.map((stop, index) => getStopLabel(stop, index));
                        tracker.setPointMessage(labels.length ? labels.join(' · ') : 'Sin paradas manuales.');
                      }}>
                      <MaterialCommunityIcons name="flag-variant-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.primaryWideText}>Ver paradas</Text>
                    </Pressable>
                    {tracker.pointMessage ? <Text style={styles.messageText}>{tracker.pointMessage}</Text> : null}
                  </View>
                  <View style={styles.configCard}>
                    <View style={styles.unitRouteCard}>
                      <View style={styles.recordCopy}>
                        <Text style={styles.recordTitle} numberOfLines={1} ellipsizeMode="tail">{selectedVehicle?.code || 'Unidad'}</Text>
                        <Text style={styles.recordDriver} numberOfLines={1}>
                          {selectedVehicle?.driverName || 'Operador sin asignar'}
                        </Text>
                      </View>
                      <StatusPill label={routeStateLabel} tone={routeUiState === 'paused' || isRouteOffRoute ? 'warning' : 'info'} />
                    </View>
                  </View>
                </>
              ) : null}


            </ScrollView>
          </Animated.View>
          </KeyboardSafeView>
        </GestureHandlerRootView>
      </Modal>
      <ConfirmModal
        visible={Boolean(routePendingDelete)}
        title="Eliminar ruta"
        description={routePendingDelete ? `Se eliminara ${routePendingDelete.name} y se limpiara de las unidades asignadas.` : undefined}
        confirmLabel="Eliminar"
        danger
        processing={isDeletingRoute}
        onCancel={() => setRoutePendingDelete(null)}
        onConfirm={confirmDeleteSavedRoute}
      />
    </AppShell>
  );
}
