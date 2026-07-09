import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createNavigationTripLogRequest,
  getNavigationTripLogsRequest,
  planNavigationRouteRequest,
  searchNavigationPlacesRequest,
} from '@/src/api/client';
import {
  distanceInMeters,
  evaluateTrackerTransition,
  type TrackerStatus,
  type TrackerZone,
} from '@/src/hooks/point-to-point-tracker-core';
import type {
  GeoPoint,
  NavigationPlaceResult,
  NavigationPlan,
  NavigationStop,
  Vehicle,
  VehicleTripRecord,
} from '@/src/types/app';
import {
  buildRouteProgressSnapshot,
  type ActiveRouteProgress,
} from '@/src/utils/active-route';

type PointRole = 'origin' | 'destination';
type TrackedLocation = GeoPoint & {
  heading?: number | null;
  speed?: number | null;
};

export type PointToPointTripRecord = VehicleTripRecord;

type UsePointToPointTrackerArgs = {
  searchAnchor: GeoPoint | null;
  trackedLocation: TrackedLocation | null;
  selectedVehicle: Vehicle | null;
  onPlanReady?: (plan: NavigationPlan, destinationLabel: string) => void;
};

export type RouteProgressSnapshot = ActiveRouteProgress;

function createVehiclePoint(vehicle: Vehicle): NavigationPlaceResult {
  return {
    id: `vehicle-point-${vehicle.id}`,
    label: `${vehicle.code} salida`,
    address: vehicle.routeName || vehicle.driverName || 'Unidad activa',
    location: vehicle.location,
  };
}

function getPointKey(point: GeoPoint) {
  return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
}

function createStopFromPlace(point: NavigationPlaceResult, order: number): NavigationStop {
  return {
    id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    latitude: point.location.latitude,
    longitude: point.location.longitude,
    address: point.address || point.label,
    order,
  };
}

function isServiceDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function getServiceDateValue(value: string | Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function shiftServiceDate(value: string, dayDelta: number) {
  if (!isServiceDateValue(value)) {
    return getServiceDateValue();
  }

  const [year, month, day] = value.split('-').map(Number);
  const nextDate = new Date(year, month - 1, day + dayDelta);

  return getServiceDateValue(nextDate);
}

function formatServiceDateLabel(value: string) {
  if (!isServiceDateValue(value)) {
    return 'Fecha invalida';
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function usePointToPointTracker({
  searchAnchor,
  trackedLocation,
  selectedVehicle,
  onPlanReady,
}: UsePointToPointTrackerArgs) {
  const [pointQueries, setPointQueries] = useState<Record<PointRole, string>>({
    origin: '',
    destination: '',
  });
  const [pointResults, setPointResults] = useState<Record<PointRole, NavigationPlaceResult[]>>({
    origin: [],
    destination: [],
  });
  const [pointSelection, setPointSelection] = useState<Record<PointRole, NavigationPlaceResult | null>>({
    origin: null,
    destination: null,
  });
  const [pointStops, setPointStops] = useState<NavigationStop[]>([]);
  const [isSearchingPoint, setIsSearchingPoint] = useState<Record<PointRole, boolean>>({
    origin: false,
    destination: false,
  });
  const [isPlanningPointRoute, setIsPlanningPointRoute] = useState(false);
  const [pointPlan, setPointPlan] = useState<NavigationPlan | null>(null);
  const [pointMessage, setPointMessage] = useState<string | null>(null);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [historyDate, setHistoryDate] = useState(getServiceDateValue);
  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus>('off');
  const [trackerStartedAt, setTrackerStartedAt] = useState<string | null>(null);
  const [trackerZone, setTrackerZone] = useState<TrackerZone>('none');
  const [trackedVehicleId, setTrackedVehicleId] = useState<string | null>(null);
  const [pausedTrackerState, setPausedTrackerState] = useState<{
    startedAt: string | null;
    status: Exclude<TrackerStatus, 'off' | 'paused'>;
    trackedVehicleId: string | null;
    zone: TrackerZone;
  } | null>(null);
  const [tripLogs, setTripLogs] = useState<PointToPointTripRecord[]>([]);
  const [isLoadingTripLogs, setIsLoadingTripLogs] = useState(false);
  const [isSavingTripLog, setIsSavingTripLog] = useState(false);
  const persistTripRef = useRef(false);
  const planRequestRef = useRef(0);
  const autoPlanStopsRef = useRef(false);

  const todayServiceDate = getServiceDateValue();
  const historyDateLabel = useMemo(() => formatServiceDateLabel(historyDate), [historyDate]);
  const trackerStatusLabel = isSavingTripLog
    ? 'Guardando vuelta'
    : trackerStatus === 'off_route'
      ? 'Fuera de ruta'
    : trackerStatus === 'in_progress'
      ? 'En recorrido'
      : trackerStatus === 'paused'
        ? 'Ruta pausada'
        : trackerStatus === 'waiting_start'
          ? 'Esperando salida'
          : 'Registro apagado';
  const trackerStatusTone: 'info' | 'warning' | 'neutral' =
    isSavingTripLog || trackerStatus === 'in_progress'
      ? 'info'
      : trackerStatus === 'waiting_start' || trackerStatus === 'paused' || trackerStatus === 'off_route'
        ? 'warning'
        : 'neutral';
  const lastTrip = tripLogs[0] || null;
  const canMoveHistoryBackward = trackerStatus === 'off' && !isLoadingTripLogs;
  const canMoveHistoryForward =
    trackerStatus === 'off' && !isLoadingTripLogs && historyDate < todayServiceDate;
  const canResetHistoryDate = trackerStatus === 'off' && historyDate !== todayServiceDate;
  const currentDistanceToOrigin = useMemo(() => {
    if (!trackedLocation || !pointSelection.origin) {
      return null;
    }

    return distanceInMeters(trackedLocation, pointSelection.origin.location);
  }, [pointSelection.origin, trackedLocation]);
  const currentDistanceToDestination = useMemo(() => {
    if (!trackedLocation || !pointSelection.destination) {
      return null;
    }

    return distanceInMeters(trackedLocation, pointSelection.destination.location);
  }, [pointSelection.destination, trackedLocation]);
  const routeProgress = useMemo(() => {
    const route = pointPlan?.routes[0] || null;

    if (!route) {
      return null;
    }

    return buildRouteProgressSnapshot({
      plannedDurationSeconds: route.durationInTrafficSeconds || route.durationSeconds || 0,
      routeDistanceMeters: route.distanceMeters || 0,
      routePolyline: route.polyline || [],
      startedAt: trackerStartedAt,
      trackedLocation,
    });
  }, [pointPlan, trackedLocation, trackerStartedAt]);
  const pointStopsSignature = useMemo(
    () => pointStops.map((stop) => `${stop.order}:${getPointKey(stop)}`).join('|'),
    [pointStops]
  );

  const clearPlan = () => {
    setPointPlan(null);
    setTrackerStatus('off');
    setTrackerStartedAt(null);
    setTrackerZone('none');
    setTrackedVehicleId(null);
    setPausedTrackerState(null);
  };

  const resetPointToPointSession = () => {
    setPointQueries({
      origin: '',
      destination: '',
    });
    setPointResults({
      origin: [],
      destination: [],
    });
    setPointSelection({
      origin: null,
      destination: null,
    });
    setPointStops([]);
    setPointPlan(null);
    setPointMessage(null);
    setTrackerStatus('off');
    setTrackerStartedAt(null);
    setTrackerZone('none');
    setTrackedVehicleId(null);
    setPausedTrackerState(null);
  };

  const updateQuery = (role: PointRole, value: string) => {
    setPointQueries((current) => ({
      ...current,
      [role]: value,
    }));
  };

  const searchPoint = async (role: PointRole) => {
    if (!pointQueries[role].trim() || !searchAnchor) {
      setPointMessage('Escribe una referencia y elige una unidad o GPS para buscar puntos.');
      return;
    }

    setIsSearchingPoint((current) => ({
      ...current,
      [role]: true,
    }));
    setPointMessage(null);

    try {
      const response = await searchNavigationPlacesRequest(pointQueries[role].trim(), searchAnchor);
      setPointResults((current) => ({
        ...current,
        [role]: response.results,
      }));

      if (!response.results.length) {
        setPointMessage(
          role === 'origin'
            ? 'No encontramos un punto de partida cercano.'
            : 'No encontramos un punto de llegada cercano.'
        );
      }
    } catch {
      setPointMessage('No fue posible buscar puntos para esta ruta.');
    } finally {
      setIsSearchingPoint((current) => ({
        ...current,
        [role]: false,
      }));
    }
  };

  const selectPoint = (role: PointRole, point: NavigationPlaceResult) => {
    setPointSelection((current) => ({
      ...current,
      [role]: point,
    }));
    setPointQueries((current) => ({
      ...current,
      [role]: point.label,
    }));
    setPointResults((current) => ({
      ...current,
      [role]: [],
    }));
    clearPlan();
    setPointMessage(role === 'origin' ? 'Punto de partida listo.' : 'Punto de llegada listo.');
  };

  const applyPointToPointSelection = (
    origin: NavigationPlaceResult,
    destination: NavigationPlaceResult,
    plan: NavigationPlan | null,
    stops: NavigationStop[] = plan?.stops || []
  ) => {
    setPointSelection({ origin, destination });
    setPointStops(stops.map((stop, index) => ({ ...stop, order: index })));
    setPointQueries({
      origin: origin.label,
      destination: destination.label,
    });
    setPointResults({ origin: [], destination: [] });
    setPointPlan(plan);
    setTrackerStatus('off');
    setTrackerStartedAt(null);
    setTrackerZone('none');
    setTrackedVehicleId(null);
    setPointMessage(plan ? `Ruta lista entre ${origin.label} y ${destination.label}.` : 'Puntos seleccionados.');
  };

  const addStop = (point: NavigationPlaceResult) => {
    if (!pointSelection.origin || !pointSelection.destination) {
      setPointMessage('Selecciona origen y destino antes de agregar una parada.');
      return;
    }

    const stopKey = getPointKey(point.location);

    if (
      stopKey === getPointKey(pointSelection.origin.location) ||
      stopKey === getPointKey(pointSelection.destination.location) ||
      pointStops.some((stop) => getPointKey(stop) === stopKey)
    ) {
      setPointMessage('La parada ya existe o coincide con origen/destino.');
      return;
    }

    autoPlanStopsRef.current = true;
    setPointStops((current) => [...current, createStopFromPlace(point, current.length)]);
    clearPlan();
    setPointMessage('Parada agregada. Recalculando ruta.');
  };

  const removeStop = (stopId: string) => {
    autoPlanStopsRef.current = true;
    setPointStops((current) =>
      current
        .filter((stop) => stop.id !== stopId)
        .map((stop, index) => ({
          ...stop,
          order: index,
        }))
    );
    clearPlan();
    setPointMessage('Parada eliminada. Recalculando ruta.');
  };

  const moveStop = (stopId: string, direction: -1 | 1) => {
    autoPlanStopsRef.current = true;
    setPointStops((current) => {
      const currentIndex = current.findIndex((stop) => stop.id === stopId);
      const nextIndex = currentIndex + direction;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const nextStops = [...current];
      const [movedStop] = nextStops.splice(currentIndex, 1);
      nextStops.splice(nextIndex, 0, movedStop);

      return nextStops.map((stop, index) => ({
        ...stop,
        order: index,
      }));
    });
    clearPlan();
    setPointMessage('Orden de paradas actualizado. Recalculando ruta.');
  };

  const useSelectedVehicleAsOrigin = () => {
    if (!selectedVehicle) {
      setPointMessage('Selecciona una unidad para usar su posicion como partida.');
      return;
    }

    const point = createVehiclePoint(selectedVehicle);
    setPointSelection((current) => ({
      ...current,
      origin: point,
    }));
    setPointQueries((current) => ({
      ...current,
      origin: point.label,
    }));
    setPointResults((current) => ({
      ...current,
      origin: [],
    }));
    clearPlan();
    setPointMessage('Partida tomada desde la unidad activa.');
  };

  const planPointToPointRoute = useCallback(async () => {
    if (!pointSelection.origin || !pointSelection.destination) {
      setPointMessage('Selecciona partida y llegada para calcular el recorrido.');
      return;
    }

    const requestId = planRequestRef.current + 1;
    planRequestRef.current = requestId;
    setIsPlanningPointRoute(true);
    setPointMessage(null);

    try {
      const response = await planNavigationRouteRequest({
        origin: pointSelection.origin.location,
        destination: pointSelection.destination.location,
        stops: pointStops,
      });

      if (requestId !== planRequestRef.current) {
        return;
      }

      setPointPlan(response);
      onPlanReady?.(response, pointSelection.destination.label);
      setPointMessage(`Ruta lista entre ${pointSelection.origin.label} y ${pointSelection.destination.label}.`);
    } catch {
      if (requestId === planRequestRef.current) {
        setPointMessage('No fue posible calcular la ruta punto a punto.');
      }
    } finally {
      if (requestId === planRequestRef.current) {
        setIsPlanningPointRoute(false);
      }
    }
  }, [onPlanReady, pointSelection.destination, pointSelection.origin, pointStops]);

  useEffect(() => {
    if (!autoPlanStopsRef.current || !pointSelection.origin || !pointSelection.destination) {
      return;
    }

    autoPlanStopsRef.current = false;
    planPointToPointRoute();
  }, [planPointToPointRoute, pointSelection.destination, pointSelection.origin, pointStopsSignature]);

  const toggleTracker = () => {
    if (trackerStatus === 'paused' && pausedTrackerState) {
      setTrackerStatus(pausedTrackerState.status);
      setTrackerStartedAt(pausedTrackerState.startedAt);
      setTrackerZone(pausedTrackerState.zone);
      setTrackedVehicleId(pausedTrackerState.trackedVehicleId);
      setPausedTrackerState(null);
      setPointMessage('Seguimiento reanudado.');
      return;
    }

    if (trackerStatus === 'paused') {
      setTrackerStatus('off');
      setTrackerStartedAt(null);
      setTrackerZone('none');
      setTrackedVehicleId(null);
      setPausedTrackerState(null);
      setPointMessage('Seguimiento detenido.');
      return;
    }

    if (trackerStatus === 'off') {
      const route = pointPlan?.routes[0] || null;

      if (!pointPlan || !route || !selectedVehicle) {
        setPointMessage('Primero calcula la ruta y elige la unidad que vas a registrar.');
        return;
      }

      if (!pointSelection.origin || !pointSelection.destination) {
        setPointMessage('Selecciona origen y destino antes de iniciar.');
        return;
      }

      if (route.polyline.length < 2) {
        setPointMessage('La ruta no tiene una polyline valida.');
        return;
      }

      if (!selectedVehicle.assignedRoute) {
        setPointMessage('Guarda la ruta para la unidad antes de iniciar.');
        return;
      }

      setHistoryDate(todayServiceDate);
      setTrackerStatus('waiting_start');
      setTrackerStartedAt(null);
      setTrackerZone('none');
      setTrackedVehicleId(selectedVehicle.id);
      setPausedTrackerState(null);
      setPointMessage('Registro activado. Esperando llegada al punto de salida.');
      return;
    }

    setPausedTrackerState({
      startedAt: trackerStartedAt,
      status: trackerStatus,
      trackedVehicleId,
      zone: trackerZone,
    });
    setTrackerStatus('paused');
    setPointMessage('Seguimiento pausado. Puedes reanudarlo cuando la unidad continue.');
  };

  const resetTrackerLog = () => {
    setTrackerStartedAt(null);
    setTrackerZone('none');
    setTrackerStatus('off');
    setTrackedVehicleId(null);
    setPausedTrackerState(null);
    setPointMessage('Registro reiniciado. El historial guardado sigue disponible.');
  };

  const goToPreviousHistoryDate = () => {
    if (!canMoveHistoryBackward) {
      return;
    }

    setHistoryDate((current) => shiftServiceDate(current, -1));
  };

  const goToNextHistoryDate = () => {
    if (!canMoveHistoryForward) {
      return;
    }

    setHistoryDate((current) => {
      const nextDate = shiftServiceDate(current, 1);
      return nextDate > todayServiceDate ? current : nextDate;
    });
  };

  const goToToday = () => {
    if (!canResetHistoryDate) {
      return;
    }

    setHistoryDate(todayServiceDate);
  };

  useEffect(() => {
    let isCancelled = false;

    if (!selectedVehicle?.id) {
      setTripLogs([]);
      setHistoryMessage(null);
      return () => {
        isCancelled = true;
      };
    }

    if (!isServiceDateValue(historyDate)) {
      setTripLogs([]);
      setHistoryMessage('La fecha del historial no es valida.');
      return () => {
        isCancelled = true;
      };
    }

    setIsLoadingTripLogs(true);
    setHistoryMessage(null);

    getNavigationTripLogsRequest({
      vehicleId: selectedVehicle.id,
      date: historyDate,
      limit: 12,
    })
      .then((response) => {
        if (isCancelled) {
          return;
        }

        setTripLogs(response.logs);
        setHistoryMessage(response.logs.length ? null : 'Sin vueltas registradas para esta fecha.');
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }

        setTripLogs([]);
        setHistoryMessage('No fue posible cargar el historial guardado.');
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingTripLogs(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [historyDate, selectedVehicle?.id]);

  useEffect(() => {
    if (!trackedVehicleId || !selectedVehicle || trackerStatus === 'off' || trackerStatus === 'paused') {
      return;
    }

    if (selectedVehicle.id !== trackedVehicleId) {
      setTrackerStatus('off');
      setTrackerStartedAt(null);
      setTrackerZone('none');
      setTrackedVehicleId(null);
      setPausedTrackerState(null);
      setPointMessage('Se cambio la unidad activa. El registro se detuvo para evitar mezclar vueltas.');
    }
  }, [selectedVehicle, trackedVehicleId, trackerStatus]);

  useEffect(() => {
    if (
      trackerStatus === 'off' ||
      trackerStatus === 'paused' ||
      !trackedLocation ||
      !pointSelection.origin ||
      !pointSelection.destination ||
      !pointPlan ||
      !selectedVehicle
    ) {
      return;
    }

    if (trackerStatus === 'in_progress' && routeProgress?.isOffRoute) {
      setTrackerStatus('off_route');
      setPointMessage('Alerta: unidad fuera de ruta.');
      return;
    }

    if (trackerStatus === 'off_route' && routeProgress && !routeProgress.isOffRoute) {
      setTrackerStatus('in_progress');
      setPointMessage('Unidad de vuelta en la ruta.');
    }

    const transition = evaluateTrackerTransition({
      destination: pointSelection.destination.location,
      origin: pointSelection.origin.location,
      trackedLocation,
      trackerStartedAt,
      trackerStatus,
      trackerZone,
    });
    const currentZone = transition.currentZone;

    if (currentZone !== trackerZone) {
      setTrackerZone(currentZone);
    }

    if (transition.event?.type === 'start') {
      setTrackerStartedAt(transition.event.startedAt);
      setTrackerStatus('in_progress');
      setPointMessage(`Recorrido iniciado en ${pointSelection.origin.label}.`);
      return;
    }

    if (transition.event?.type === 'finish' && trackerStartedAt && !persistTripRef.current) {
      const finishedAt = transition.event.finishedAt;
      const durationSeconds = transition.event.durationSeconds;

      persistTripRef.current = true;
      setIsSavingTripLog(true);

      createNavigationTripLogRequest({
        vehicleId: selectedVehicle.id,
        vehicleCode: selectedVehicle.code,
        serviceDate: getServiceDateValue(finishedAt),
        originLabel: pointSelection.origin.label,
        destinationLabel: pointSelection.destination.label,
        origin: pointSelection.origin.location,
        destination: pointSelection.destination.location,
        startedAt: trackerStartedAt,
        finishedAt,
        durationSeconds,
        distanceMeters: pointPlan.routes[0]?.distanceMeters || 0,
        plannedDurationSeconds:
          pointPlan.routes[0]?.durationInTrafficSeconds || pointPlan.routes[0]?.durationSeconds || 0,
        provider: pointPlan.provider,
      })
        .then((savedTrip) => {
          setHistoryDate(getServiceDateValue(savedTrip.finishedAt));
          setTripLogs((current) =>
            [savedTrip, ...current.filter((entry) => entry.id !== savedTrip.id)].sort(
              (left, right) =>
                new Date(right.finishedAt).getTime() - new Date(left.finishedAt).getTime()
            )
          );
          setHistoryMessage(null);
          setPointMessage(`Vuelta ${savedTrip.lap} registrada. Esperando nuevo paso por la salida.`);
        })
        .catch(() => {
          setPointMessage('La vuelta se detecto, pero no se pudo guardar en el historial.');
        })
        .finally(() => {
          persistTripRef.current = false;
          setIsSavingTripLog(false);
          setTrackerStartedAt(null);
          setTrackerStatus('waiting_start');
          setPausedTrackerState(null);
        });
    }
  }, [
    pointPlan,
    pointSelection.destination,
    pointSelection.origin,
    pointStops,
    routeProgress,
    selectedVehicle,
    trackedLocation,
    trackerStartedAt,
    trackerStatus,
    trackerZone,
  ]);

  return {
    canMoveHistoryBackward,
    canMoveHistoryForward,
    canResetHistoryDate,
    currentDistanceToDestination,
    currentDistanceToOrigin,
    goToNextHistoryDate,
    goToPreviousHistoryDate,
    goToToday,
    historyDate,
    historyDateLabel,
    historyMessage,
    isLoadingTripLogs,
    isPlanningPointRoute,
    isSavingTripLog,
    isSearchingPoint,
    applyPointToPointSelection,
    addStop,
    lastTrip,
    planPointToPointRoute,
    pointMessage,
    pointPlan,
    pointQueries,
    pointResults,
    pointSelection,
    pointStops,
    moveStop,
    removeStop,
    resetPointToPointSession,
    resetTrackerLog,
    routeProgress,
    searchPoint,
    selectPoint,
    setPointMessage,
    toggleTracker,
    trackerStatus,
    trackerStatusLabel,
    trackerStatusTone,
    tripLogs,
    updateQuery,
    useSelectedVehicleAsOrigin,
  };
}
