import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { palette } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { useAppStore } from '@/src/store/use-app-store';
import { PortalSectionCard } from '../cards';
import type { GeoPoint, NavigationStop, SavedRoute, Vehicle } from '@/src/types/app';
import {
  approveLearnedRouteCandidateRequest,
  createSavedRouteRequest,
  deleteSavedRouteRequest,
  getApiErrorMessage,
  getLearnedRouteCandidatesRequest,
  getSavedRoutesRequest,
  planSavedRouteRequest,
  rejectLearnedRouteCandidateRequest,
  updateSavedRouteRequest,
  type LearnedRouteCandidate,
} from '@/src/lib/api';
import { PortalLayout } from '../components/portal-layout';
import { PortalButton } from '../components/portal-button';
import { portalPalette } from '../portal-theme';
import { RouteEditor, createBlankEditor } from '../routes/routes.types';
import { createLatestRoutePlanAuthority } from '../routes/latest-route-plan-authority.js';
import { parseCoordinate, getRouteGeometry, getDriverName, getRouteLabel } from '../routes/routes.utils';
import { applyOperationalSnapshot } from '../dashboard/dashboard.utils';
import { styles } from '../routes/routes.styles';
import { RouteUnitSelector } from '../routes/components/route-unit-selector';
import { RouteCatalogPanel } from '../routes/components/route-catalog-panel';
import { RoutePreviewPanel } from '../routes/components/route-preview-panel';
import { RouteEditorToolbar } from '../routes/components/route-editor-toolbar';
import { RouteEditorDetails } from '../routes/components/route-editor-details';
import { RouteAssignedPanel } from '../routes/components/route-assigned-panel';

const RouteMap = lazy(() => import('../components/operations-map').then((m) => ({ default: m.OperationsMap })));

/**
 * "3 recorridos en 2 días": lo que sostiene la sugerencia es evidencia repetida
 * EN EL TIEMPO, no solo un conteo. Los umbrales los decide el backend
 * (domain/learned-route-evidence.js); aquí solo se presentan sus números.
 */
function formatCandidateEvidence(candidate: LearnedRouteCandidate) {
  const runs = candidate.evidenceCount || 0;
  const days = candidate.distinctServiceDays || 0;
  const runLabel = `${runs} ${runs === 1 ? 'recorrido' : 'recorridos'}`;
  if (!days) return runLabel;
  return `${runLabel} en ${days} ${days === 1 ? 'día' : 'días'}`;
}

export function PortalRoutesScreen() {
  const {
    assignRoute,
    clearRouteAssignment,
    isSubmitting,
    loadVehicles,
    operationalUnits,
    user,
    vehicles,
  } = useAppStore(
    useShallow((state) => ({
      assignRoute: state.assignRoute,
      clearRouteAssignment: state.clearRouteAssignment,
      isSubmitting: state.isSubmitting,
      loadVehicles: state.loadVehicles,
      operationalUnits: state.operationalUnits,
      user: state.user,
      vehicles: state.vehicles,
    }))
  );
  const canManageRoutes = Boolean(user && ['owner', 'admin'].includes(user.role));
  const sortedVehicles = useMemo(
    () => [...vehicles].sort((left, right) => String(left.code || '').localeCompare(String(right.code || ''))),
    [vehicles]
  );
  const routeVehicles = useMemo(
    () => sortedVehicles.filter((vehicle) => vehicle.status !== 'maintenance'),
    [sortedVehicles]
  );
  // Espeja el patrón de portal-dashboard-screen (:85-91): indexa el snapshot canónico por
  // unidad y proyecta una lista mergeada EXCLUSIVA del selector. `routeVehicles` se deja
  // crudo para los demás consumidores (editor :60/:241, selectedVehicle → mapa), que leen
  // `.id`/`assignedRoute` (que el merge preserva) y no el estado operativo.
  const snapshotByVehicle = useMemo(
    () => new Map(operationalUnits.map((unit) => [unit.unitId, unit])),
    [operationalUnits]
  );
  const operationalRouteVehicles = useMemo(
    () => routeVehicles.map((vehicle) => applyOperationalSnapshot(vehicle, snapshotByVehicle.get(vehicle.id))),
    [routeVehicles, snapshotByVehicle]
  );
  const vehiclesWithRoutes = useMemo(
    () => sortedVehicles.filter((vehicle) => vehicle.assignedRoute),
    [sortedVehicles]
  );
  const [editor, setEditor] = useState<RouteEditor>(() => createBlankEditor(routeVehicles[0]?.id));
  const selectedVehicle = useMemo(
    () => routeVehicles.find((vehicle) => vehicle.id === editor.vehicleId) || null,
    [editor.vehicleId, routeVehicles]
  );
  const editorPoints = useMemo(() => {
    const originLatitude = parseCoordinate(editor.originLatitude, -90, 90);
    const originLongitude = parseCoordinate(editor.originLongitude, -180, 180);
    const destinationLatitude = parseCoordinate(editor.destinationLatitude, -90, 90);
    const destinationLongitude = parseCoordinate(editor.destinationLongitude, -180, 180);
    const points: GeoPoint[] = [];
    if (originLatitude !== null && originLongitude !== null) {
      points.push({ latitude: originLatitude, longitude: originLongitude });
    }
    if (destinationLatitude !== null && destinationLongitude !== null) {
      points.push({ latitude: destinationLatitude, longitude: destinationLongitude });
    }
    return points;
  }, [editor.destinationLatitude, editor.destinationLongitude, editor.originLatitude, editor.originLongitude]);
  // Mientras el editor tenga puntos se dibuja el borrador; si no, la ruta ya asignada de la unidad.
  const mapRouteCoordinates = editorPoints.length ? editorPoints : getRouteGeometry(selectedVehicle);
  const mapCheckpoints = editorPoints.length ? [] : selectedVehicle?.assignedRoute?.stops || [];
  const [message, setMessage] = useState<string | null>(null);
  const [routeToClear, setRouteToClear] = useState<Vehicle | null>(null);
  const [duplicateSourceId, setDuplicateSourceId] = useState<string | null>(null);
  const [mapSelectMode, setMapSelectMode] = useState<'origin' | 'destination' | null>(null);
  const [showAssignmentBanner, setShowAssignmentBanner] = useState(false);
  const [routeOverwriteTarget, setRouteOverwriteTarget] = useState<Vehicle | null>(null);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState<SavedRoute | null>(null);
  const [showRouteEditor, setShowRouteEditor] = useState(false);
  const [routeName, setRouteName] = useState('');
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [editorStops, setEditorStops] = useState<NavigationStop[]>([]);
  const [editorGeometry, setEditorGeometry] = useState<GeoPoint[]>([]);
  const [editorMetrics, setEditorMetrics] = useState({ distanceMeters: 0, durationSeconds: 0, durationInTrafficSeconds: 0 });
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [editorTool, setEditorTool] = useState<'select' | 'checkpoint' | 'insert'>('select');
  const [draggedStopId, setDraggedStopId] = useState<string | null>(null);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<'recent' | 'name' | 'distance'>('recent');
  const [filterMode, setFilterMode] = useState<'all' | 'assigned' | 'unused'>('all');
  const [learnedCandidates, setLearnedCandidates] = useState<LearnedRouteCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [candidateBusy, setCandidateBusy] = useState(false);
  // Oferta de asignacion posterior a aprobar. Guardar una ruta y asignarla a una
  // unidad son dos decisiones distintas; la segunda siempre la toma el operador.
  const [approvedRouteOffer, setApprovedRouteOffer] = useState<{ routeId: string; vehicleId: string } | null>(null);
  const routePlanAuthorityRef = useRef(createLatestRoutePlanAuthority());

  useEffect(() => {
    void loadVehicles();
    void getSavedRoutesRequest().then((routes) => {
      setSavedRoutes(routes);
      setSelectedRouteId((current) => current || routes[0]?.id || null);
    }).catch((error) => setMessage(getApiErrorMessage(error, 'No fue posible cargar el catálogo de rutas.')));
  }, [loadVehicles]);

  useEffect(() => {
    if (!canManageRoutes) return;
    void getLearnedRouteCandidatesRequest().then((candidates) => {
      setLearnedCandidates(candidates);
      setSelectedCandidateId((current) => current || candidates[0]?.id || null);
    }).catch((error) => setMessage(getApiErrorMessage(error, 'No fue posible cargar las rutas sugeridas.')));
  }, [canManageRoutes]);

  const selectedCandidate = useMemo(
    () => learnedCandidates.find((candidate) => candidate.id === selectedCandidateId) || learnedCandidates[0] || null,
    [learnedCandidates, selectedCandidateId]
  );

  const reviewLearnedCandidate = async (decision: 'approve' | 'reject') => {
    if (!selectedCandidate || candidateBusy) return;
    setCandidateBusy(true);
    try {
      if (decision === 'approve') {
        const approved = await approveLearnedRouteCandidateRequest(selectedCandidate.id);
        setSavedRoutes(await getSavedRoutesRequest());
        // Aprobar crea la ruta oficial; asignarla es una decision aparte y
        // explicita del administrador. Se ofrece, nunca se hace sola.
        if (approved?.approvedRouteId) {
          setApprovedRouteOffer({
            routeId: approved.approvedRouteId,
            vehicleId: selectedCandidate.vehicleId,
          });
          setMessage(null);
        } else {
          setMessage('Ruta sugerida aprobada y agregada al catálogo sin asignarla a ninguna unidad.');
        }
      } else {
        await rejectLearnedRouteCandidateRequest(selectedCandidate.id);
        setMessage('Ruta sugerida rechazada.');
      }
      setLearnedCandidates((current) => current.filter((candidate) => candidate.id !== selectedCandidate.id));
      setSelectedCandidateId(null);
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible revisar la ruta sugerida.'));
    } finally {
      setCandidateBusy(false);
    }
  };

  const approvedOfferVehicle = useMemo(
    () => routeVehicles.find((vehicle) => vehicle.id === approvedRouteOffer?.vehicleId) || null,
    [approvedRouteOffer, routeVehicles]
  );

  /** Asigna la ruta recien aprobada, solo si el administrador lo pide. */
  const acceptApprovedRouteAssignment = async () => {
    if (!approvedRouteOffer) return;
    const route = savedRoutes.find((entry) => entry.id === approvedRouteOffer.routeId);
    if (!route?.origin || !route?.destination) {
      setApprovedRouteOffer(null);
      return setMessage('La ruta quedó guardada en el catálogo. Asígnala desde el catálogo cuando lo necesites.');
    }
    const result = await assignRoute({
      vehicleId: approvedRouteOffer.vehicleId,
      routeId: route.id,
      originLabel: route.originLabel || route.name,
      destinationLabel: route.destinationLabel || '',
      origin: route.origin,
      destination: route.destination,
    });
    setApprovedRouteOffer(null);
    setMessage(result.ok ? 'Ruta guardada y asignada.' : result.message || 'No fue posible asignar la ruta.');
    if (result.ok) setShowAssignmentBanner(true);
  };

  const selectedSavedRoute = useMemo(
    () => savedRoutes.find((route) => route.id === selectedRouteId) || null,
    [savedRoutes, selectedRouteId]
  );

  const filteredRoutes = useMemo(() => {
    const assignedIds = new Set(vehicles.map((vehicle) => vehicle.routeId).filter(Boolean));
    return savedRoutes
      .filter((route) => !search.trim() || `${route.name} ${route.code} ${route.originLabel} ${route.destinationLabel}`.toLowerCase().includes(search.trim().toLowerCase()))
      .filter((route) => filterMode === 'all' || (filterMode === 'assigned' ? assignedIds.has(route.id) : !assignedIds.has(route.id)))
      .sort((left, right) => sortMode === 'name' ? left.name.localeCompare(right.name) : sortMode === 'distance' ? right.distanceMeters - left.distanceMeters : new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime());
  }, [filterMode, savedRoutes, search, sortMode, vehicles]);

  const editablePoints = useMemo(() => {
    const origin = editorPoints[0]; const destination = editorPoints[1];
    return [
      ...(origin ? [{ id: 'origin', kind: 'origin' as const, point: origin }] : []),
      ...editorStops.map((stop) => ({ id: stop.id, kind: 'checkpoint' as const, point: stop })),
      ...(destination ? [{ id: 'destination', kind: 'destination' as const, point: destination }] : []),
    ];
  }, [editorPoints, editorStops]);

  useEffect(() => {
    const planRequest = routePlanAuthorityRef.current.begin();
    const origin = editorPoints[0]; const destination = editorPoints[1];
    if (!showRouteEditor || !origin || !destination) {
      if (!origin || !destination) setEditorGeometry(editorPoints);
      setCatalogBusy(false);
      planRequest.invalidate();
      return;
    }
    const timer = window.setTimeout(() => {
      if (!planRequest.isCurrent()) return;
      setCatalogBusy(true);
      void planSavedRouteRequest({ origin, destination, stops: editorStops }).then((plan) => {
        if (!planRequest.isCurrent()) return;
        const route = plan.routes?.[0]; if (!route) return;
        setEditorGeometry(route.polyline || []);
        setEditorMetrics({ distanceMeters: route.distanceMeters || 0, durationSeconds: route.durationSeconds || 0, durationInTrafficSeconds: route.durationInTrafficSeconds || 0 });
      }).catch((error) => {
        if (!planRequest.isCurrent()) return;
        setMessage(getApiErrorMessage(error, 'No fue posible recalcular la geometría.'));
      }).finally(() => {
        if (planRequest.isCurrent()) setCatalogBusy(false);
      });
    }, 320);
    return () => {
      window.clearTimeout(timer);
      planRequest.invalidate();
    };
  }, [editorPoints, editorStops, showRouteEditor]);

  const createCatalogRoute = async () => {
    const origin = editorPoints[0];
    const destination = editorPoints[1];
    const name = routeName.trim();
    if (!name || !origin || !destination || !editor.originLabel.trim() || !editor.destinationLabel.trim()) {
      setMessage('Completa nombre, origen y destino de la nueva ruta.');
      return;
    }
    if (name.length > 100) {
      setMessage('El nombre de la ruta no puede exceder 100 caracteres.');
      return;
    }
    if (!editingRouteId && savedRoutes.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      setMessage('Ya existe una ruta con ese nombre.');
      return;
    }
    setCatalogBusy(true);
    try {
      const payload = {
        name, origin, destination,
        originLabel: editor.originLabel.trim(), destinationLabel: editor.destinationLabel.trim(), stops: editorStops,
        route: { label: name, ...editorMetrics, polyline: editorGeometry.length >= 2 ? editorGeometry : [origin, destination] },
      };
      const route = editingRouteId ? await updateSavedRouteRequest(editingRouteId, payload) : await createSavedRouteRequest(payload);
      setSavedRoutes((current) => editingRouteId ? current.map((item) => item.id === route.id ? route : item) : [route, ...current]);
      setSelectedRouteId(route.id);
      setShowRouteEditor(false);
      setRouteName('');
      setEditingRouteId(null); setEditorStops([]); setEditorGeometry([]); setSelectedPointId(null);
      setMessage('Ruta guardada en el catálogo.');
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible guardar la ruta.'));
    } finally { setCatalogBusy(false); }
  };

  const openNewRouteEditor = () => {
    setEditingRouteId(null); setRouteName(''); setEditorStops([]); setEditorGeometry([]); setSelectedPointId(null);
    setEditor(createBlankEditor(editor.vehicleId)); setShowRouteEditor(true);
  };

  const openExistingRouteEditor = (route: SavedRoute) => {
    setEditingRouteId(route.id); setRouteName(route.name); setEditorStops(route.stops || []); setEditorGeometry(route.polyline || []);
    setEditorMetrics({ distanceMeters: route.distanceMeters || 0, durationSeconds: route.durationSeconds || 0, durationInTrafficSeconds: route.durationInTrafficSeconds || 0 });
    setEditor((current) => ({ ...current, originLabel: route.originLabel || '', originLatitude: String(route.origin.latitude), originLongitude: String(route.origin.longitude), destinationLabel: route.destinationLabel || '', destinationLatitude: String(route.destination.latitude), destinationLongitude: String(route.destination.longitude) }));
    setSelectedPointId(null); setShowRouteEditor(true);
  };

  const updateEditablePoint = (id: string, point: GeoPoint) => {
    if (id === 'origin') { setField('originLatitude', String(point.latitude)); setField('originLongitude', String(point.longitude)); return; }
    if (id === 'destination') { setField('destinationLatitude', String(point.latitude)); setField('destinationLongitude', String(point.longitude)); return; }
    setEditorStops((current) => current.map((stop) => stop.id === id ? { ...stop, ...point } : stop));
  };

  const deleteSelectedPoint = () => {
    if (!selectedPointId) return;
    if (selectedPointId === 'origin') { setField('originLatitude', ''); setField('originLongitude', ''); }
    else if (selectedPointId === 'destination') { setField('destinationLatitude', ''); setField('destinationLongitude', ''); }
    else setEditorStops((current) => current.filter((stop) => stop.id !== selectedPointId).map((stop, order) => ({ ...stop, order })));
    setSelectedPointId(null);
  };

  const moveStop = (sourceId: string, targetId: string) => setEditorStops((current) => {
    const from = current.findIndex((stop) => stop.id === sourceId); const to = current.findIndex((stop) => stop.id === targetId);
    if (from < 0 || to < 0 || from === to) return current;
    const next = [...current]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
    return next.map((stop, order) => ({ ...stop, order }));
  });

  const insertAtSegment = (segmentIndex: number) => {
    const points = editablePoints.map((entry) => entry.point); const left = points[segmentIndex]; const right = points[segmentIndex + 1];
    if (!left || !right) return;
    const id = `stop-${Date.now()}`; const stop: NavigationStop = { id, latitude: (left.latitude + right.latitude) / 2, longitude: (left.longitude + right.longitude) / 2, address: `Checkpoint ${segmentIndex + 1}`, order: segmentIndex };
    setEditorStops((current) => [...current.slice(0, segmentIndex), stop, ...current.slice(segmentIndex)].map((entry, order) => ({ ...entry, order })));
    setSelectedPointId(id); setSelectedSegmentIndex(segmentIndex);
  };

  const assignSavedRoute = async () => {
    if (!editor.vehicleId || !selectedSavedRoute) return setMessage('Selecciona una unidad y una ruta.');
    if (!selectedSavedRoute.origin || !selectedSavedRoute.destination) return setMessage('La ruta seleccionada no tiene origen o destino definidos.');
    if (isSubmitting) return;
    const result = await assignRoute({
      vehicleId: editor.vehicleId, routeId: selectedSavedRoute.id,
      originLabel: selectedSavedRoute.originLabel || selectedSavedRoute.name,
      destinationLabel: selectedSavedRoute.destinationLabel || '',
      origin: selectedSavedRoute.origin, destination: selectedSavedRoute.destination,
    });
    setMessage(result.ok ? 'Ruta del catálogo asignada.' : result.message || 'No fue posible asignar la ruta.');
    if (result.ok) setShowAssignmentBanner(true);
  };

  useEffect(() => {
    if (!editor.vehicleId && routeVehicles[0]?.id) {
      setEditor((current) => ({ ...current, vehicleId: routeVehicles[0].id }));
    }
  }, [editor.vehicleId, routeVehicles]);

  const setField = <T extends keyof RouteEditor>(field: T, value: RouteEditor[T]) => {
    setEditor((current) => ({ ...current, [field]: value }));
  };

  const loadRoute = (vehicle: Vehicle) => {
    const route = vehicle.assignedRoute;
    if (!route) return;
    setEditor({
      vehicleId: vehicle.id,
      originLabel: route.originLabel || '',
      originLatitude: String(route.origin?.latitude || ''),
      originLongitude: String(route.origin?.longitude || ''),
      destinationLabel: route.destinationLabel || '',
      destinationLatitude: String(route.destination?.latitude || ''),
      destinationLongitude: String(route.destination?.longitude || ''),
    });
  };

  const duplicateRoute = async (source: Vehicle) => {
    if (!source.assignedRoute || !editor.vehicleId) return;
    const route = source.assignedRoute;
    const result = await assignRoute({
      vehicleId: editor.vehicleId,
      originLabel: route.originLabel || '',
      destinationLabel: route.destinationLabel || '',
      origin: route.origin || { latitude: 0, longitude: 0 },
      destination: route.destination || { latitude: 0, longitude: 0 },
    });
    setMessage(result.ok ? 'Ruta duplicada en la unidad seleccionada.' : result.message || 'No fue posible duplicar la ruta.');
    setDuplicateSourceId(null);
  };

  const saveRoute = async () => {
    setMessage(null);

    if (!editor.vehicleId) {
      setMessage('Selecciona una unidad.');
      return;
    }

    if (!editor.originLabel.trim() || !editor.destinationLabel.trim()) {
      setMessage('Origen y destino son obligatorios.');
      return;
    }

    if (editor.originLabel.trim().length > 200) {
      setMessage('El nombre del origen no puede exceder 200 caracteres.');
      return;
    }

    if (editor.destinationLabel.trim().length > 200) {
      setMessage('El nombre del destino no puede exceder 200 caracteres.');
      return;
    }

    const originLatitude = parseCoordinate(editor.originLatitude, -90, 90);
    const originLongitude = parseCoordinate(editor.originLongitude, -180, 180);
    const destinationLatitude = parseCoordinate(editor.destinationLatitude, -90, 90);
    const destinationLongitude = parseCoordinate(editor.destinationLongitude, -180, 180);

    if (
      originLatitude === null ||
      originLongitude === null ||
      destinationLatitude === null ||
      destinationLongitude === null
    ) {
      setMessage('Las coordenadas deben ser reales y estar dentro de rango.');
      return;
    }

    const targetVehicle = vehicles.find((v) => v.id === editor.vehicleId);
    if (targetVehicle?.assignedRoute) {
      setRouteOverwriteTarget(targetVehicle);
      return;
    }

    await executeAssignRoute();
  };

  const executeAssignRoute = async () => {
    if (!editor.vehicleId) return;
    if (isSubmitting) return;

    const originLabel = editor.originLabel.trim();
    const destinationLabel = editor.destinationLabel.trim();

    if (!originLabel || !destinationLabel) {
      setMessage('Origen y destino son obligatorios.');
      return;
    }

    const originLatitude = parseCoordinate(editor.originLatitude, -90, 90);
    const originLongitude = parseCoordinate(editor.originLongitude, -180, 180);
    const destinationLatitude = parseCoordinate(editor.destinationLatitude, -90, 90);
    const destinationLongitude = parseCoordinate(editor.destinationLongitude, -180, 180);

    const result = await assignRoute({
      vehicleId: editor.vehicleId,
      originLabel,
      destinationLabel,
      origin: {
        latitude: originLatitude,
        longitude: originLongitude,
      },
      destination: {
        latitude: destinationLatitude,
        longitude: destinationLongitude,
      },
    });

    if (!result.ok) {
      setMessage(result.message || 'No fue posible asignar la ruta.');
      return;
    }

    setEditor(createBlankEditor(editor.vehicleId));
    setMessage('Ruta asignada.');
    setShowAssignmentBanner(true);
  };

  const clearRoute = async (vehicleId: string) => {
    setMessage(null);
    const result = await clearRouteAssignment(vehicleId);

    if (!result.ok) {
      setMessage(result.message || 'No fue posible liberar la ruta.');
      return false;
    }

    setMessage('Ruta liberada.');
    return true;
  };

  const editorActions = (
    <View style={styles.editorTopActions}>
      <PortalButton onPress={() => setShowRouteEditor(false)} size="sm" variant="secondary">Cancelar</PortalButton>
      <PortalButton loading={catalogBusy} onPress={() => void createCatalogRoute()} size="sm">Guardar ruta</PortalButton>
    </View>
  );

  const mapMode = showRouteEditor ? 'editor' : 'preview';

  const mapElement = (
    <RouteMap
      key="stable-route-map"
      {...(mapMode === 'editor' ? {
        editablePoints,
        height: '100%',
        highlightedSegment: selectedSegmentIndex === null ? [] : [editablePoints[selectedSegmentIndex]?.point, editablePoints[selectedSegmentIndex + 1]?.point].filter(Boolean) as GeoPoint[],
        selectedEditablePointId: selectedPointId,
        onEditablePointSelect: setSelectedPointId,
        onEditablePointChange: updateEditablePoint,
        onClickPoint: (point: GeoPoint) => {
          if (!editorPoints[0]) { setField('originLatitude', String(point.latitude)); setField('originLongitude', String(point.longitude)); setSelectedPointId('origin'); }
          else if (!editorPoints[1]) { setField('destinationLatitude', String(point.latitude)); setField('destinationLongitude', String(point.longitude)); setSelectedPointId('destination'); }
          else if (editorTool === 'checkpoint' || editorTool === 'insert') { const id = `stop-${Date.now()}`; const next = { id, ...point, address: `Checkpoint ${editorStops.length + 1}`, order: editorStops.length }; setEditorStops((current) => editorTool === 'insert' ? [...current.slice(0, Math.ceil(current.length / 2)), next, ...current.slice(Math.ceil(current.length / 2))].map((stop, order) => ({ ...stop, order })) : [...current, next]); setSelectedPointId(id); }
        },
        routeCoordinates: editorGeometry.length >= 2 ? editorGeometry : editablePoints.map((entry) => entry.point),
        vehicles: [],
      } : {
        checkpoints: selectedSavedRoute?.stops || [],
        height: '100%',
        routeCoordinates: selectedSavedRoute?.polyline || [],
        vehicles: [],
      })}
    />
  );

  return (
    <PortalLayout
      actions={showRouteEditor ? editorActions : <PortalButton icon="plus" onPress={openNewRouteEditor} size="sm">Nueva ruta</PortalButton>}
      compact
      compactScrollable
      wide
      title={showRouteEditor ? 'Editor de ruta' : 'Rutas'}
      subtitle={showRouteEditor ? 'Crea y edita la ruta agregando paradas y checkpoints.' : 'Asignación real de origen y destino por unidad.'}>
      {showAssignmentBanner && !showRouteEditor && canManageRoutes ? (
        <View style={styles.continuityBanner}>
          <MaterialCommunityIcons name="check-circle" size={18} color="#FFFFFF" />
          <Text style={styles.continuityText}>Ruta asignada. Abre el centro de operaciones para monitorear la unidad.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/portal' as never)} style={styles.continuityButton}>
            <Text style={styles.continuityButtonText}>Ir a operaciones</Text>
            <MaterialCommunityIcons name="arrow-right" size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : null}

      {message && !showRouteEditor ? <View style={styles.inlineFeedback}><MaterialCommunityIcons name="information-outline" size={16} color={portalPalette.info} /><Text style={styles.inlineFeedbackText}>{message}</Text></View> : null}

      {approvedRouteOffer && !showRouteEditor ? (
        <View style={styles.inlineFeedback}>
          <MaterialCommunityIcons name="check-circle-outline" size={16} color={portalPalette.info} />
          <Text style={styles.inlineFeedbackText}>
            Ruta guardada.{approvedOfferVehicle ? ` ¿Deseas asignarla a ${approvedOfferVehicle.code}?` : ''}
          </Text>
          {approvedOfferVehicle ? (
            <PortalButton onPress={() => void acceptApprovedRouteAssignment()} size="sm">
              Asignar
            </PortalButton>
          ) : null}
          <PortalButton onPress={() => setApprovedRouteOffer(null)} size="sm" variant="secondary">
            Ahora no
          </PortalButton>
        </View>
      ) : null}

      {!showRouteEditor && canManageRoutes && learnedCandidates.length > 0 ? (
        <PortalSectionCard
          title="Rutas aprendidas pendientes"
          subtitle="Las sugerencias requieren evidencia repetida y nunca se asignan automáticamente.">
          <View style={styles.assignmentWorkspace}>
            <View style={styles.assignedPanel}>
              {learnedCandidates.map((candidate) => (
                <Pressable
                  key={candidate.id}
                  onPress={() => setSelectedCandidateId(candidate.id)}
                  style={styles.assignedCard}>
                  <View style={styles.assignedHeader}>
                    <Text style={styles.assignedName}>
                      {candidate.vehicleCount === 1
                        ? `1 unidad de evidencia`
                        : `${candidate.vehicleCount || candidate.evidenceVehicleIds?.length || 1} unidades de evidencia`}
                    </Text>
                    <StatusBadge label={formatCandidateEvidence(candidate)} tone="info" />
                  </View>
                  <Text style={styles.assignedDate}>
                    {(candidate.distanceMeters / 1000).toFixed(1)} km · {Math.round(candidate.durationSeconds / 60)} min · confianza {Math.round(candidate.confidence * 100)}%
                  </Text>
                </Pressable>
              ))}
            </View>
            {selectedCandidate ? (
              <View style={styles.previewColumn}>
                <Suspense fallback={<View style={styles.mapFallback}><Text style={styles.mapFallbackText}>Cargando sugerencia...</Text></View>}>
                  <RouteMap height={260} routeCoordinates={selectedCandidate.polyline} vehicles={[]} />
                </Suspense>
                <View style={styles.assignedActions}>
                  <PortalButton disabled={candidateBusy} onPress={() => void reviewLearnedCandidate('reject')} size="sm" variant="secondary">
                    Rechazar
                  </PortalButton>
                  <PortalButton loading={candidateBusy} onPress={() => void reviewLearnedCandidate('approve')} size="sm">
                    Aprobar al catálogo
                  </PortalButton>
                </View>
              </View>
            ) : null}
          </View>
        </PortalSectionCard>
      ) : null}

      <View style={showRouteEditor ? styles.fullEditorShell : styles.assignmentWorkspace}>
        {showRouteEditor ? (
          <RouteEditorToolbar
            editorTool={editorTool}
            onToolChange={setEditorTool}
            selectedPointId={selectedPointId}
            onDeleteSelected={deleteSelectedPoint}
            onClearRoute={() => { setEditor(createBlankEditor(editor.vehicleId)); setEditorStops([]); setEditorGeometry([]); }}
          />
        ) : canManageRoutes ? (
          <>
            <RouteUnitSelector
              vehicles={operationalRouteVehicles}
              selectedVehicleId={editor.vehicleId}
              onSelectVehicle={(vehicleId) => setField('vehicleId', vehicleId)}
            />
            <RouteCatalogPanel
              search={search}
              onSearchChange={setSearch}
              filterMode={filterMode}
              onFilterModeChange={setFilterMode}
              sortMode={sortMode}
              onSortModeChange={setSortMode}
              filteredRoutes={filteredRoutes}
              selectedRouteId={selectedRouteId}
              onSelectRoute={setSelectedRouteId}
              onDeleteRoute={setRouteToDelete}
              savedRoutes={savedRoutes}
            />
          </>
        ) : null}

        <View style={showRouteEditor ? styles.editorMap : styles.previewColumn}>
          {showRouteEditor ? (
            <View style={{ flex: 1, position: 'relative' }}>
              <Suspense fallback={<View style={styles.mapFallback}><Text style={styles.mapFallbackText}>Cargando mapa...</Text></View>}>
                {mapElement}
              </Suspense>
            </View>
          ) : (
            <RoutePreviewPanel
              canAssign={Boolean(editor.vehicleId)}
              isAssigning={isSubmitting}
              onAssignRoute={() => void assignSavedRoute()}
              onEditRoute={() => { if (selectedSavedRoute) openExistingRouteEditor(selectedSavedRoute); }}
              selectedSavedRoute={selectedSavedRoute}>
              <Suspense fallback={<View style={styles.mapFallback}><Text style={styles.mapFallbackText}>Cargando vista previa...</Text></View>}>
                {mapElement}
              </Suspense>
            </RoutePreviewPanel>
          )}
        </View>

        {showRouteEditor ? (
          <RouteEditorDetails
            routeName={routeName}
            onRouteNameChange={setRouteName}
            originLabel={editor.originLabel}
            onOriginLabelChange={(value) => setField('originLabel', value)}
            destinationLabel={editor.destinationLabel}
            onDestinationLabelChange={(value) => setField('destinationLabel', value)}
            editorMetrics={editorMetrics}
            editorStops={editorStops}
            editablePoints={editablePoints}
            selectedPointId={selectedPointId}
            onSelectPoint={setSelectedPointId}
            draggedStopId={draggedStopId}
            onDragStart={setDraggedStopId}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(targetId) => moveStop(draggedStopId, targetId)}
            selectedSegmentIndex={selectedSegmentIndex}
            onInsertAtSegment={(index) => { setSelectedSegmentIndex(index); insertAtSegment(index); }}
            catalogBusy={catalogBusy}
            onClearDraggedStop={() => setDraggedStopId(null)}
          />
        ) : (
          <RouteAssignedPanel
            selectedVehicle={selectedVehicle}
            selectedSavedRoute={selectedSavedRoute}
            routeLabel={getRouteLabel(selectedVehicle)}
            routeGeometry={getRouteGeometry(selectedVehicle)}
            onEdit={() => { if (selectedSavedRoute) openExistingRouteEditor(selectedSavedRoute); }}
            onClear={() => setRouteToClear(selectedVehicle)}
          />
        )}
      </View>


      <ConfirmModal
        visible={Boolean(routeToDelete)}
        destructive
        title={`Eliminar ruta "${routeToDelete?.name || ''}"`}
        description={
          routeToDelete
            ? `Esta acción eliminará la ruta "${routeToDelete.name}" del catálogo.${
                vehicles.filter((v) => v.routeId === routeToDelete.id).length > 0
                  ? ` Actualmente está asignada a ${vehicles.filter((v) => v.routeId === routeToDelete.id).length} unidad(es). Debe desasignarla antes de eliminarla.`
                  : ''
              }`
            : ''
        }
        confirmLabel="Eliminar"
        processing={catalogBusy}
        onCancel={() => setRouteToDelete(null)}
        onConfirm={async () => {
          if (!routeToDelete) return;
          setCatalogBusy(true);
          try {
            await deleteSavedRouteRequest(routeToDelete.id);
            setSavedRoutes((current) => current.filter((r) => r.id !== routeToDelete.id));
            setSelectedRouteId((current) => (current === routeToDelete.id ? null : current));
            setMessage('Ruta eliminada.');
          } catch (error) {
            setMessage(getApiErrorMessage(error, 'No fue posible eliminar la ruta.'));
          } finally {
            setCatalogBusy(false);
            setRouteToDelete(null);
          }
        }}
      />
      <ConfirmModal
        visible={Boolean(duplicateSourceId)}
        title="Duplicar ruta"
        description="La ruta se copiará a la unidad seleccionada en el formulario de asignación."
        confirmLabel="Duplicar"
        processing={isSubmitting}
        onCancel={() => setDuplicateSourceId(null)}
        onConfirm={() => {
          const source = vehicles.find((v) => v.id === duplicateSourceId);
          if (source) void duplicateRoute(source);
        }}
      />
      <ConfirmModal
        visible={Boolean(routeToClear)}
        title="Liberar ruta"
        description={`La unidad ${routeToClear?.code || 'seleccionada'} quedará sin ruta asignada.`}
        confirmLabel="Liberar ruta"
        destructive
        processing={isSubmitting}
        onCancel={() => setRouteToClear(null)}
        onConfirm={() => {
          if (!routeToClear) return;
          void clearRoute(routeToClear.id).then((cleared) => {
            if (cleared) setRouteToClear(null);
          });
        }}
      />

      <ConfirmModal
        visible={Boolean(routeOverwriteTarget)}
        title="Sobrescribir ruta"
        description={`${routeOverwriteTarget?.code || 'La unidad'} ya tiene una ruta asignada. ¿Sobrescribirla?`}
        confirmLabel="Sobrescribir"
        destructive
        processing={isSubmitting}
        onCancel={() => setRouteOverwriteTarget(null)}
        onConfirm={() => {
          setRouteOverwriteTarget(null);
          void executeAssignRoute();
        }}
      />
    </PortalLayout>
  );
}

