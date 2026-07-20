import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, palette, Typography } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { useAppStore } from '@/src/store/use-app-store';
import type { GeoPoint, NavigationStop, SavedRoute, Vehicle } from '@/src/types/app';
import { createSavedRouteRequest, deleteSavedRouteRequest, getApiErrorMessage, getSavedRoutesRequest, planSavedRouteRequest, updateSavedRouteRequest } from '@/src/lib/api';
import { RouteGeometryThumbnail } from '../components/route-geometry-thumbnail';
import { PortalSectionCard } from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { PortalButton } from '../components/portal-button';
import { portalButtonGradient, portalPalette } from '../portal-theme';

const RouteMap = lazy(() => import('../components/operations-map').then((m) => ({ default: m.OperationsMap })));

type RouteEditor = {
  vehicleId: string;
  originLabel: string;
  originLatitude: string;
  originLongitude: string;
  destinationLabel: string;
  destinationLatitude: string;
  destinationLongitude: string;
};

function createBlankEditor(vehicleId = ''): RouteEditor {
  return {
    vehicleId,
    originLabel: '',
    originLatitude: '',
    originLongitude: '',
    destinationLabel: '',
    destinationLatitude: '',
    destinationLongitude: '',
  };
}

function parseCoordinate(value: string, min: number, max: number) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const coordinate = Number(trimmed);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max ? coordinate : null;
}

function getRouteGeometry(vehicle?: Vehicle | null): GeoPoint[] {
  if (!vehicle?.assignedRoute) return [];
  const polyline = vehicle.assignedRoute.route?.polyline || [];
  if (polyline.length >= 2) return polyline;
  return [vehicle.assignedRoute.origin, vehicle.assignedRoute.destination].filter(Boolean) as GeoPoint[];
}

function getDriverName(vehicle: Vehicle) {
  return vehicle.driver?.name || vehicle.driverName || 'Sin conductor';
}

function getRouteLabel(vehicle: Vehicle) {
  const assignment = vehicle.assignedRoute;

  if (!assignment) {
    return 'Sin ruta asignada';
  }

  const origin = assignment.originLabel || 'Origen';
  const destination = assignment.destinationLabel || 'Destino';
  return `${origin} -> ${destination}`;
}

export function PortalRoutesScreen() {
  const {
    assignRoute,
    clearRouteAssignment,
    isSubmitting,
    loadVehicles,
    user,
    vehicles,
  } = useAppStore(
    useShallow((state) => ({
      assignRoute: state.assignRoute,
      clearRouteAssignment: state.clearRouteAssignment,
      isSubmitting: state.isSubmitting,
      loadVehicles: state.loadVehicles,
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

  useEffect(() => {
    void loadVehicles();
    void getSavedRoutesRequest().then((routes) => {
      setSavedRoutes(routes);
      setSelectedRouteId((current) => current || routes[0]?.id || null);
    }).catch((error) => setMessage(getApiErrorMessage(error, 'No fue posible cargar el catálogo de rutas.')));
  }, [loadVehicles]);

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
    const origin = editorPoints[0]; const destination = editorPoints[1];
    if (!showRouteEditor || !origin || !destination) { if (!origin || !destination) setEditorGeometry(editorPoints); return; }
    const timer = window.setTimeout(() => {
      setCatalogBusy(true);
      void planSavedRouteRequest({ origin, destination, stops: editorStops }).then((plan) => {
        const route = plan.routes?.[0]; if (!route) return;
        setEditorGeometry(route.polyline || []);
        setEditorMetrics({ distanceMeters: route.distanceMeters || 0, durationSeconds: route.durationSeconds || 0, durationInTrafficSeconds: route.durationInTrafficSeconds || 0 });
      }).catch((error) => setMessage(getApiErrorMessage(error, 'No fue posible recalcular la geometría.'))).finally(() => setCatalogBusy(false));
    }, 320);
    return () => window.clearTimeout(timer);
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

      <View style={showRouteEditor ? styles.fullEditorShell : styles.assignmentWorkspace}>
        {showRouteEditor ? (
          <View style={styles.editorTools}>
            <Text style={styles.sectionEyebrow}>Herramientas</Text>
            <Pressable onPress={() => setEditorTool('select')} style={[styles.toolButton, editorTool === 'select' ? styles.toolButtonActive : undefined]}><MaterialCommunityIcons name="cursor-default" size={18} color={portalPalette.text} /><Text style={styles.toolText}>Seleccionar / mover</Text></Pressable>
            <Pressable onPress={() => setEditorTool('checkpoint')} style={[styles.toolButton, editorTool === 'checkpoint' ? styles.toolButtonActive : undefined]}><MaterialCommunityIcons name="flag-plus" size={18} color={portalPalette.info} /><Text style={styles.toolText}>Agregar checkpoint</Text></Pressable>
            <Pressable onPress={() => setEditorTool('insert')} style={[styles.toolButton, editorTool === 'insert' ? styles.toolButtonActive : undefined]}><MaterialCommunityIcons name="vector-polyline-plus" size={18} color={portalPalette.accent} /><Text style={styles.toolText}>Insertar entre puntos</Text></Pressable>
            <Pressable disabled={!selectedPointId} onPress={deleteSelectedPoint} style={[styles.toolButton, !selectedPointId ? styles.disabledButton : undefined]}><MaterialCommunityIcons name="delete-outline" size={18} color={palette.warning} /><Text style={styles.toolText}>Eliminar seleccionado</Text></Pressable>
            <Pressable onPress={() => { setEditor(createBlankEditor(editor.vehicleId)); setEditorStops([]); setEditorGeometry([]); }} style={styles.toolButton}><MaterialCommunityIcons name="delete-sweep" size={18} color={palette.warning} /><Text style={styles.toolText}>Limpiar ruta</Text></Pressable>
            <View style={styles.editorLegend}><Text style={styles.legendText}>● Verde: origen</Text><Text style={styles.legendText}>● Azul: checkpoint</Text><Text style={styles.legendText}>● Rojo: destino</Text></View>
          </View>
        ) : canManageRoutes ? (
          <>
            <View style={styles.unitsPanel}>
              <View style={styles.panelHeading}><Text style={styles.panelTitle}>Selecciona una unidad</Text><Text style={styles.panelCount}>{routeVehicles.length}</Text></View>
              <View style={styles.unitsList}>{routeVehicles.map((vehicle) => {
                const active = editor.vehicleId === vehicle.id;
                return <Pressable accessibilityState={{ selected: active }} key={vehicle.id} onPress={() => setField('vehicleId', vehicle.id)} style={[styles.unitCard, active ? styles.unitCardActive : undefined]}>
                  <View style={[styles.unitIcon, active ? styles.unitIconActive : undefined]}><MaterialCommunityIcons name="bus" size={20} color={active ? '#FFFFFF' : portalPalette.accent} /></View>
                  <View style={styles.routeBody}><Text style={styles.unitCode}>{vehicle.code}</Text><Text numberOfLines={1} style={styles.unitDriver}>{getDriverName(vehicle)}</Text><Text style={styles.unitStatus}>● {vehicle.status === 'maintenance' ? 'Mantenimiento' : vehicle.assignedRoute ? 'En jornada' : 'Disponible'}</Text></View>
                </Pressable>;
              })}</View>
            </View>

            <View style={styles.catalogPanel}>
              <View style={styles.panelHeading}><Text style={styles.panelTitle}>Rutas disponibles</Text><Text style={styles.panelCount}>{filteredRoutes.length}</Text></View>
              <TextInput accessibilityLabel="Buscar rutas" value={search} onChangeText={setSearch} placeholder="Buscar ruta" placeholderTextColor={palette.muted} style={[styles.compactSearch, { borderColor: palette.lineStrong, color: palette.text }]} />
              <View style={styles.compactFilters}>{(['all','assigned','unused'] as const).map((mode) => <Pressable key={mode} onPress={() => setFilterMode(mode)} style={[styles.filterChip, filterMode === mode ? styles.filterChipActive : undefined]}><Text style={styles.filterChipText}>{mode === 'all' ? 'Todas' : mode === 'assigned' ? 'Asignadas' : 'Sin uso'}</Text></Pressable>)}</View>
              <View style={styles.compactFilters}>{(['recent','name','distance'] as const).map((mode) => <Pressable key={mode} onPress={() => setSortMode(mode)} style={[styles.sortChip, sortMode === mode ? styles.sortChipActive : undefined]}><Text style={styles.sortChipText}>{mode === 'recent' ? 'Recientes' : mode === 'name' ? 'Nombre' : 'Distancia'}</Text></Pressable>)}</View>
              <View style={styles.catalogList}>{filteredRoutes.length ? filteredRoutes.map((route) => <Pressable {...({ className: 'route-catalog-card' } as any)} accessibilityRole="button" accessibilityState={{ selected: selectedRouteId === route.id }} key={route.id} onPress={() => setSelectedRouteId(route.id)} style={[styles.compactRouteCard, selectedRouteId === route.id ? styles.compactRouteCardActive : undefined]}>
                <View style={styles.compactRouteInfo}><Text numberOfLines={1} style={styles.compactRouteName}>{route.name}</Text><View style={styles.compactMetrics}><Text style={styles.compactMetric}>{((route.distanceMeters || 0) / 1000).toFixed(1)} km</Text><Text style={styles.compactMetric}>{route.stops?.length || 0} paradas</Text></View></View>
                <View style={styles.thumbnailWrap}><RouteGeometryThumbnail color={route.color} polyline={route.polyline} stops={route.stops} /></View>
                <Pressable accessibilityLabel={`Eliminar ruta ${route.name}`} onPress={(event) => { event.stopPropagation(); setRouteToDelete(route); }} style={styles.deleteRouteButton}><MaterialCommunityIcons name="trash-can-outline" size={16} color={portalPalette.danger} /></Pressable>
              </Pressable>) : <EmptyState icon="routes" title={savedRoutes.length ? 'Sin coincidencias' : 'Aún no hay rutas'} description={savedRoutes.length ? 'Ajusta los filtros.' : 'Crea la primera ruta.'} />}</View>
            </View>
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
            <>
              <View style={styles.previewMapShell}>
                <View style={styles.mapLabel}><MaterialCommunityIcons name="map-outline" size={15} color={portalPalette.text} /><Text style={styles.mapLabelText}>Vista previa de la ruta seleccionada</Text></View>
                {selectedSavedRoute ? (
                  <Suspense fallback={<View style={styles.mapFallback}><Text style={styles.mapFallbackText}>Cargando vista previa...</Text></View>}>
                    {mapElement}
                  </Suspense>
                ) : <EmptyState icon="map-search-outline" title="Selecciona una ruta" description="La geometría aparecerá aquí." />}
              </View>
              {selectedSavedRoute ? <View style={styles.mapActionBar}>
                <View style={styles.mapRouteIdentity}><View style={styles.mapRouteIcon}><MaterialCommunityIcons name="routes" size={22} color={portalPalette.accent} /></View><View style={styles.routeBody}><Text numberOfLines={1} style={styles.mapRouteName}>{selectedSavedRoute.name}</Text><Text numberOfLines={1} style={styles.mapRoutePath}>{selectedSavedRoute.originLabel || 'Origen'} → {selectedSavedRoute.destinationLabel || 'Destino'}</Text></View></View>
                <View style={styles.mapStats}><View><Text style={styles.statValue}>{((selectedSavedRoute.distanceMeters || 0) / 1000).toFixed(1)} km</Text><Text style={styles.statLabel}>Distancia</Text></View><View><Text style={styles.statValue}>{selectedSavedRoute.stops.length}</Text><Text style={styles.statLabel}>Checkpoints</Text></View><View><Text style={styles.statValue}>{Math.round((selectedSavedRoute.durationSeconds || 0) / 60)} min</Text><Text style={styles.statLabel}>Duración</Text></View></View>
                <View style={styles.mapActions}><PortalButton onPress={() => openExistingRouteEditor(selectedSavedRoute)} size="sm" variant="secondary">Editar</PortalButton><PortalButton disabled={!editor.vehicleId} loading={isSubmitting} onPress={() => void assignSavedRoute()} size="sm">Asignar ruta</PortalButton></View>
              </View> : null}
            </>
          )}
        </View>

        {showRouteEditor ? (
          <View style={styles.editorDetails}>
            <Text style={styles.editorTitle}>Detalles de la ruta</Text>
            <TextInput value={routeName} onChangeText={setRouteName} placeholder="Nombre de la ruta" placeholderTextColor={palette.muted} style={[styles.input, { borderColor: palette.lineStrong, color: palette.text }]} />
            <TextInput value={editor.originLabel} onChangeText={(value) => setField('originLabel', value)} placeholder="Origen" placeholderTextColor={palette.muted} style={[styles.input, { borderColor: palette.lineStrong, color: palette.text }]} />
            <TextInput value={editor.destinationLabel} onChangeText={(value) => setField('destinationLabel', value)} placeholder="Destino" placeholderTextColor={palette.muted} style={[styles.input, { borderColor: palette.lineStrong, color: palette.text }]} />
            <View style={styles.metricsRow}><Text style={styles.metricText}>{(editorMetrics.distanceMeters / 1000).toFixed(1)} km</Text><Text style={styles.metricText}>{Math.round(editorMetrics.durationSeconds / 60)} min</Text><Text style={styles.metricText}>{editorStops.length} checkpoints</Text></View>
            <Text style={styles.sectionEyebrow}>Paradas y checkpoints</Text>
            <View style={styles.pointList}>
              {editablePoints.map((entry, index) => <View key={entry.id} {...({ draggable: entry.kind === 'checkpoint', onDragStart: () => setDraggedStopId(entry.id), onDragOver: (event: DragEvent) => event.preventDefault(), onDrop: () => { if (draggedStopId && entry.kind === 'checkpoint') moveStop(draggedStopId, entry.id); setDraggedStopId(null); } } as any)} style={[styles.pointRow, selectedPointId === entry.id ? styles.pointRowActive : undefined]}>
                <Pressable onPress={() => setSelectedPointId(entry.id)} style={styles.pointRowMain}><MaterialCommunityIcons name={entry.kind === 'checkpoint' ? 'flag-outline' : 'map-marker'} size={17} color={entry.kind === 'origin' ? '#22c55e' : entry.kind === 'destination' ? '#ef4444' : '#38bdf8'} /><View style={styles.routeBody}><Text style={styles.pointTitle}>{entry.kind === 'origin' ? 'Origen' : entry.kind === 'destination' ? 'Destino' : `Checkpoint ${index}`}</Text><Text style={styles.coordText}>{entry.point.latitude.toFixed(5)}, {entry.point.longitude.toFixed(5)}</Text></View>{entry.kind === 'checkpoint' ? <MaterialCommunityIcons name="drag" size={18} color={portalPalette.muted} /> : null}</Pressable>
                {index < editablePoints.length - 1 ? <Pressable accessibilityLabel={`Insertar checkpoint después de ${index + 1}`} onPress={() => { setSelectedSegmentIndex(index); insertAtSegment(index); }} style={[styles.insertSegmentButton, selectedSegmentIndex === index ? styles.insertSegmentButtonActive : undefined]}><MaterialCommunityIcons name="plus" size={14} color={portalPalette.info} /><Text style={styles.insertSegmentText}>Insertar en este segmento</Text></Pressable> : null}
              </View>)}
            </View>
            <Text style={styles.coordText}>{catalogBusy ? 'Recalculando geometría…' : 'Arrastra cualquier marcador para moverlo. Los cambios se recalculan automáticamente.'}</Text>
          </View>
        ) : (
          <View style={styles.assignedPanel}>
            <View style={styles.panelHeading}><Text style={styles.panelTitle}>Rutas asignadas a {selectedVehicle?.code || '—'}</Text><Text style={styles.panelCount}>{selectedVehicle?.assignedRoute ? 1 : 0}</Text></View>
            {selectedVehicle?.assignedRoute ? <View style={styles.assignedCard}><View style={styles.assignedHeader}><Text numberOfLines={1} style={styles.assignedName}>{selectedVehicle.assignedRoute.route?.label || getRouteLabel(selectedVehicle)}</Text><StatusBadge label="Activa" tone="positive" /></View><RouteGeometryThumbnail color={selectedVehicle.routeColor} polyline={getRouteGeometry(selectedVehicle)} stops={selectedVehicle.assignedRoute.stops} /><Text style={styles.assignedDate}>Asignada: {selectedVehicle.assignedRoute.assignedAt ? new Date(selectedVehicle.assignedRoute.assignedAt).toLocaleString('es-MX') : 'Sin fecha'}</Text><View style={styles.assignedActions}><Pressable accessibilityLabel="Editar ruta asignada" disabled={!selectedSavedRoute} onPress={() => selectedSavedRoute && openExistingRouteEditor(selectedSavedRoute)} style={styles.iconAction}><MaterialCommunityIcons name="pencil-outline" size={18} color={portalPalette.info} /></Pressable><Pressable accessibilityLabel="Liberar ruta" onPress={() => setRouteToClear(selectedVehicle)} style={styles.iconAction}><MaterialCommunityIcons name="delete-outline" size={18} color={portalPalette.danger} /></Pressable></View></View> : <EmptyState icon="routes" title="Sin ruta asignada" description="Selecciona una ruta del catálogo y asígnala." />}
          </View>
        )}
      </View>

      {false && canManageRoutes ? (
        <PortalSectionCard
          title="Asignar ruta"
          subtitle={message || undefined}>
          {routeVehicles.length ? (
            <>
              <View style={styles.segmentRow}>
                {routeVehicles.map((vehicle) => (
                  <Pressable
                    key={vehicle.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${vehicle.code} · ${getDriverName(vehicle)}`}
                    onPress={() => setField('vehicleId', vehicle.id)}
                    style={[
                      styles.segment,
                      {
                        backgroundColor: editor.vehicleId === vehicle.id ? palette.infoSoft : palette.surfaceAlt,
                        borderColor: editor.vehicleId === vehicle.id ? palette.info : palette.line,
                      },
                    ]}>
                    <Text style={[styles.segmentText, { color: editor.vehicleId === vehicle.id ? palette.info : palette.text }]}>
                      {vehicle.code}
                    </Text>
                    <Text style={[styles.segmentDriver, { color: palette.muted }]} numberOfLines={1}>
                      {getDriverName(vehicle)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.formGrid}>
                <TextInput
                  value={editor.originLabel}
                  onChangeText={(value) => setField('originLabel', value)}
                   placeholder="Origen"
                   accessibilityLabel="Origen"
                  placeholderTextColor={palette.muted}
                  style={[styles.input, { borderColor: palette.lineStrong, color: palette.text }]}
                />
                <TextInput
                  value={editor.destinationLabel}
                  onChangeText={(value) => setField('destinationLabel', value)}
                   placeholder="Destino"
                   accessibilityLabel="Destino"
                  placeholderTextColor={palette.muted}
                  style={[styles.input, { borderColor: palette.lineStrong, color: palette.text }]}
                />
              </View>
              <View style={styles.mapSelectToggle}>
                <Pressable
                  onPress={() => setMapSelectMode(mapSelectMode === 'origin' ? null : 'origin')}
                  style={[styles.mapSelectButton, mapSelectMode === 'origin' ? styles.mapSelectButtonActive : undefined]}>
                  <MaterialCommunityIcons name="map-marker" size={16} color={mapSelectMode === 'origin' ? '#FFFFFF' : portalPalette.text} />
                  <Text style={[styles.mapSelectText, mapSelectMode === 'origin' ? { color: '#FFFFFF' } : undefined]}>
                    {editor.originLatitude && editor.originLongitude ? 'Origen en mapa ✓' : 'Seleccionar origen en mapa'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setMapSelectMode(mapSelectMode === 'destination' ? null : 'destination')}
                  style={[styles.mapSelectButton, mapSelectMode === 'destination' ? styles.mapSelectButtonActive : undefined]}>
                  <MaterialCommunityIcons name="map-marker-check" size={16} color={mapSelectMode === 'destination' ? '#FFFFFF' : portalPalette.text} />
                  <Text style={[styles.mapSelectText, mapSelectMode === 'destination' ? { color: '#FFFFFF' } : undefined]}>
                    {editor.destinationLatitude && editor.destinationLongitude ? 'Destino en mapa ✓' : 'Seleccionar destino en mapa'}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.mapContainer}>
                <Suspense fallback={<View style={styles.mapFallback}><Text style={styles.mapFallbackText}>Cargando mapa...</Text></View>}>
                  <RouteMap
                    autoFit={!mapSelectMode}
                    checkpoints={mapCheckpoints}
                    height={260}
                    onClickPoint={(point) => {
                      if (mapSelectMode === 'origin') {
                        setField('originLatitude', String(point.latitude));
                        setField('originLongitude', String(point.longitude));
                        setMapSelectMode('destination');
                      } else if (mapSelectMode === 'destination') {
                        setField('destinationLatitude', String(point.latitude));
                        setField('destinationLongitude', String(point.longitude));
                        setMapSelectMode(null);
                      }
                    }}
                    onVehiclePress={(vehicle) => setField('vehicleId', vehicle.id)}
                    routeCoordinates={mapRouteCoordinates}
                    selectedVehicleId={editor.vehicleId}
                    vehicles={routeVehicles}
                  />
                </Suspense>
                <Text style={styles.mapHint}>
                  {mapSelectMode === 'origin'
                    ? 'Haz clic en el mapa para marcar el origen'
                    : mapSelectMode === 'destination'
                      ? 'Haz clic en el mapa para marcar el destino'
                      : selectedVehicle
                        ? `Viendo ${selectedVehicle.code} · ${getDriverName(selectedVehicle)}. Toca otra unidad en el mapa para cambiar.`
                        : 'Selecciona una unidad para ver su ruta.'}
                </Text>
              </View>
              <View style={styles.coordPreview}>
                <Text style={styles.coordText}>
                  Origen: {editor.originLatitude ? `${editor.originLatitude}, ${editor.originLongitude}` : 'Sin definir'}
                </Text>
                <Text style={styles.coordText}>
                  Destino: {editor.destinationLatitude ? `${editor.destinationLatitude}, ${editor.destinationLongitude}` : 'Sin definir'}
                </Text>
              </View>
              <View style={styles.actions}>
                <PortalButton icon="map-marker-path" loading={isSubmitting} onPress={() => void saveRoute()}>Asignar ruta</PortalButton>
              </View>
            </>
          ) : (
            <EmptyState
              icon="bus-alert"
              title="Sin unidades disponibles"
              description="Crea una unidad antes de asignar una ruta."
            />
          )}
        </PortalSectionCard>
      ) : null}

      {false && sortedVehicles.length ? <PortalSectionCard
        title="Rutas por unidad"
        subtitle={`${sortedVehicles.length} ${sortedVehicles.length === 1 ? 'unidad' : 'unidades'}`}
        right={vehiclesWithRoutes.length ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/portal' as never)} style={styles.continueButton}>
            <Text style={styles.continueButtonText}>Abrir operaciones</Text>
            <MaterialCommunityIcons name="arrow-right" size={16} color="#FFFFFF" />
          </Pressable>
        ) : undefined}>
          <View style={styles.list}>
            {sortedVehicles.map((vehicle) => (
              <View key={vehicle.id} style={[styles.routeRow, { borderColor: palette.line, backgroundColor: palette.surface }]}>
                <View style={[styles.routeIcon, { backgroundColor: palette.surfaceAlt }]}>
                  <MaterialCommunityIcons name="routes" size={21} color={palette.accent} />
                </View>
                <View style={styles.routeBody}>
                  <Text style={[styles.routeName, { color: palette.text }]}>{vehicle.code}</Text>
                  <Text style={[styles.routeMeta, { color: palette.muted }]}>{getRouteLabel(vehicle)}</Text>
                  <Text style={[styles.routeMeta, { color: palette.muted }]}>
                    Conductor: {vehicle.driver?.name || vehicle.driverName || 'Sin conductor'}
                  </Text>
                </View>
                <StatusBadge
                  label={vehicle.assignedRoute ? 'Asignada' : 'No asignada'}
                  tone={vehicle.assignedRoute ? 'positive' : 'neutral'}
                />
                {canManageRoutes ? (
                  <View style={styles.rowActions}>
                    {vehicle.assignedRoute ? (
                      <>
                        <PortalButton
                          accessibilityLabel={`Editar ruta de ${vehicle.code}`}
                          onPress={() => loadRoute(vehicle)}
                          icon="pencil-outline"
                          size="sm"
                          variant="icon" />
                        <PortalButton
                          accessibilityLabel={`Liberar ruta de ${vehicle.code}`}
                          onPress={() => setRouteToClear(vehicle)}
                          disabled={isSubmitting}
                          icon="link-off"
                          size="sm"
                          variant="danger" />
                        {routeVehicles.length > 1 ? (
                          <PortalButton
                            accessibilityLabel={`Duplicar ruta de ${vehicle.code}`}
                            onPress={() => setDuplicateSourceId(vehicle.id)}
                            disabled={isSubmitting}
                            icon="content-copy"
                            size="sm"
                            variant="icon" />
                        ) : null}
                      </>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
      </PortalSectionCard> : null}
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
            const result = await deleteSavedRouteRequest(routeToDelete.id);
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

const styles = StyleSheet.create({
  assignmentWorkspace: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, minHeight: 560, minWidth: 0 },
  unitsPanel: { backgroundColor: portalPalette.surface, borderColor: portalPalette.line, borderRadius: 14, borderWidth: 1, flexBasis: 190, flexGrow: 1, gap: 6, maxWidth: 230, minWidth: 180, padding: 8 },
  catalogPanel: { backgroundColor: portalPalette.surface, borderColor: portalPalette.line, borderRadius: 14, borderWidth: 1, flexBasis: 240, flexGrow: 1, gap: 5, maxWidth: 290, minWidth: 220, padding: 8 },
  previewColumn: { flex: 5, flexBasis: 500, gap: 0, minHeight: 550, minWidth: 330 },
  assignedPanel: { backgroundColor: portalPalette.surface, borderColor: portalPalette.line, borderRadius: 14, borderWidth: 1, flexBasis: 270, flexGrow: 1, gap: 8, maxWidth: 320, minWidth: 250, padding: 10 },
  panelHeading: { alignItems: 'center', flexDirection: 'row', gap: 7, justifyContent: 'space-between' },
  panelTitle: { color: portalPalette.text, flex: 1, fontFamily: Typography.body, fontSize: 13, fontWeight: '900' },
  panelCount: { backgroundColor: portalPalette.surfaceSoft, borderRadius: 999, color: portalPalette.muted, fontFamily: Typography.mono, fontSize: 10, fontWeight: '900', minWidth: 22, paddingHorizontal: 6, paddingVertical: 3, textAlign: 'center' },
  unitsList: { gap: 7 },
  unitCard: { alignItems: 'center', backgroundColor: portalPalette.surfaceSoft, borderColor: portalPalette.line, borderRadius: 11, borderWidth: 1, flexDirection: 'row', gap: 7, minHeight: 52, padding: 7, transitionDuration: '0.2s', transitionProperty: 'background-color, border-color, box-shadow, transform', ':hover': { backgroundColor: 'rgba(255,255,255,0.075)', borderColor: portalPalette.muted }, ':active': { transform: 'scale(0.98)' } },
  unitCardActive: { backgroundColor: portalPalette.accentSoft, borderColor: portalPalette.accent, shadowColor: portalPalette.accent, shadowOpacity: 0.22, shadowRadius: 16, elevation: 6 },
  unitIcon: { alignItems: 'center', backgroundColor: portalPalette.accentSoft, borderRadius: 8, height: 32, justifyContent: 'center', width: 32 },
  unitIconActive: { backgroundColor: portalPalette.accent },
  unitCode: { color: portalPalette.text, fontFamily: Typography.display, fontSize: 16, fontWeight: '900' },
  unitDriver: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 10, fontWeight: '700' },
  unitStatus: { color: '#34d399', fontFamily: Typography.body, fontSize: 9, fontWeight: '800', marginTop: 2 },
  compactSearch: { backgroundColor: portalPalette.surfaceSoft, borderRadius: 9, borderWidth: 1, fontFamily: Typography.body, fontSize: 11, minHeight: 34, paddingHorizontal: 10 },
  compactFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  catalogList: { gap: 5, maxHeight: 420, overflow: 'auto' },
  compactRouteCard: { alignItems: 'stretch', backgroundColor: portalPalette.surfaceSoft, borderColor: portalPalette.line, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 58, overflow: 'hidden', padding: 5, transitionDuration: '0.2s', transitionProperty: 'background-color, border-color, box-shadow, transform', ':hover': { backgroundColor: 'rgba(255,255,255,0.075)', borderColor: portalPalette.muted }, ':active': { transform: 'scale(0.98)' } },
  compactRouteCardActive: { backgroundColor: portalPalette.accentSoft, borderColor: portalPalette.accent, shadowColor: portalPalette.accent, shadowOpacity: 0.2, shadowRadius: 14, elevation: 6 },
  compactRouteInfo: { flex: 1, gap: 5, justifyContent: 'center', minWidth: 90 },
  compactRouteName: { color: portalPalette.text, fontFamily: Typography.body, fontSize: 10, fontWeight: '900' },
  compactMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  compactMetric: { backgroundColor: 'rgba(148,163,184,.1)', borderRadius: 5, color: portalPalette.muted, fontFamily: Typography.mono, fontSize: 8, paddingHorizontal: 5, paddingVertical: 3 },
  thumbnailWrap: { flexBasis: 88, justifyContent: 'center', maxWidth: 98, minWidth: 78 },
  previewMapShell: { backgroundColor: portalPalette.surface, borderColor: portalPalette.line, borderRadius: 14, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderWidth: 1, flex: 1, minHeight: 450, overflow: 'hidden', position: 'relative' },
  mapLabel: { alignItems: 'center', backgroundColor: 'rgba(7,14,29,.86)', borderBottomRightRadius: 9, flexDirection: 'row', gap: 6, left: 0, paddingHorizontal: 10, paddingVertical: 7, position: 'absolute', top: 0, zIndex: 5 },
  mapLabelText: { color: portalPalette.text, fontFamily: Typography.body, fontSize: 10, fontWeight: '800' },
  mapActionBar: { alignItems: 'center', backgroundColor: portalPalette.surface, borderColor: portalPalette.line, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, borderTopWidth: 0, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8, minHeight: 58, padding: 8 },
  mapRouteIdentity: { alignItems: 'center', flex: 2, flexBasis: 180, flexDirection: 'row', gap: 8, minWidth: 0 },
  mapRouteIcon: { alignItems: 'center', backgroundColor: portalPalette.accentSoft, borderRadius: 8, height: 32, justifyContent: 'center', width: 32 },
  mapRouteName: { color: portalPalette.text, fontFamily: Typography.body, fontSize: 12, fontWeight: '900' },
  mapRoutePath: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 9 },
  mapStats: { alignItems: 'center', flex: 2, flexBasis: 190, flexDirection: 'row', gap: 18, justifyContent: 'center' },
  statValue: { color: portalPalette.text, fontFamily: Typography.display, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  statLabel: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 8, marginTop: 2, textAlign: 'center' },
  mapActions: { flexDirection: 'row', gap: 7, marginLeft: 'auto' },
  assignedCard: { backgroundColor: portalPalette.surfaceSoft, borderColor: portalPalette.line, borderRadius: 11, borderWidth: 1, gap: 6, overflow: 'hidden', padding: 7 },
  assignedHeader: { alignItems: 'center', flexDirection: 'row', gap: 7, justifyContent: 'space-between' },
  assignedName: { color: portalPalette.text, flex: 1, fontFamily: Typography.body, fontSize: 11, fontWeight: '900' },
  assignedDate: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 9 },
  assignedActions: { flexDirection: 'row', gap: 6, justifyContent: 'flex-end' },
  inlineFeedback: { alignItems: 'center', backgroundColor: portalPalette.infoSoft, borderColor: portalPalette.info, borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 7, minHeight: 34, paddingHorizontal: 10 },
  inlineFeedbackText: { color: portalPalette.text, flex: 1, fontFamily: Typography.body, fontSize: 11, fontWeight: '700' },
  editorTopActions: { flexDirection: 'row', gap: 7 },
  sortChip: { borderBottomColor: 'transparent', borderBottomWidth: 1, paddingHorizontal: 4, paddingVertical: 3, transitionDuration: '0.2s', transitionProperty: 'border-color, opacity', ':hover': { opacity: 0.8 }, ':active': { opacity: 0.7 } },
  sortChipActive: { borderBottomColor: portalPalette.accent },
  sortChipText: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 9, fontWeight: '800' },
  fullEditorShell: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, minHeight: 580, minWidth: 0 },
  editorTools: { backgroundColor: portalPalette.surface, borderColor: portalPalette.line, borderRadius: AppTheme.radius.sm, borderWidth: 1, flexBasis: 180, flexGrow: 1, gap: 6, maxWidth: 230, minWidth: 170, padding: 10 },
  editorMap: { flex: 6, flexBasis: 520, minHeight: 580, minWidth: 300 },
  editorDetails: { backgroundColor: portalPalette.surface, borderColor: portalPalette.line, borderRadius: AppTheme.radius.sm, borderWidth: 1, flexBasis: 300, flexGrow: 2, gap: 10, minWidth: 280, padding: 12 },
  toolButton: { alignItems: 'center', backgroundColor: portalPalette.surfaceSoft, borderColor: portalPalette.line, borderRadius: AppTheme.radius.xs, borderWidth: 1, flexDirection: 'row', gap: 7, minHeight: 36, paddingHorizontal: 9, transitionDuration: '0.2s', transitionProperty: 'background-color, border-color, transform', ':hover': { backgroundColor: 'rgba(255,255,255,0.075)' }, ':active': { transform: 'scale(0.97)' } },
  toolText: { color: portalPalette.text, fontFamily: Typography.body, fontSize: 11, fontWeight: '800' },
  toolButtonActive: { backgroundColor: portalPalette.infoSoft, borderColor: portalPalette.info },
  editorLegend: { borderTopColor: portalPalette.line, borderTopWidth: 1, gap: 5, marginTop: 4, paddingTop: 10 },
  legendText: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 11, fontWeight: '700' },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metricText: { backgroundColor: portalPalette.surfaceSoft, borderRadius: AppTheme.radius.xs, color: portalPalette.text, fontFamily: Typography.mono, fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 6 },
  pointList: { gap: 5, maxHeight: 250, overflow: 'auto' },
  pointRow: { backgroundColor: portalPalette.surfaceSoft, borderColor: portalPalette.line, borderRadius: AppTheme.radius.xs, borderWidth: 1, minHeight: 40 },
  pointRowActive: { backgroundColor: portalPalette.infoSoft, borderColor: portalPalette.info },
  pointRowMain: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 40, paddingHorizontal: 8 },
  pointTitle: { color: portalPalette.text, fontFamily: Typography.body, fontSize: 12, fontWeight: '900' },
  insertSegmentButton: { alignItems: 'center', borderTopColor: portalPalette.line, borderTopWidth: 1, flexDirection: 'row', gap: 4, justifyContent: 'center', minHeight: 24 },
  insertSegmentButtonActive: { backgroundColor: portalPalette.infoSoft },
  insertSegmentText: { color: portalPalette.info, fontFamily: Typography.body, fontSize: 10, fontWeight: '800' },
  editorFooter: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 'auto' },
  secondaryButton: { alignItems: 'center', borderColor: portalPalette.lineStrong, borderRadius: AppTheme.radius.sm, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: 12, transitionDuration: '0.2s', transitionProperty: 'background-color, border-color, transform', ':hover': { backgroundColor: portalPalette.surfaceSoft, borderColor: portalPalette.muted }, ':active': { transform: 'scale(0.97)' } },
  sectionEyebrow: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 11, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  previewPanel: { backgroundColor: portalPalette.surfaceSoft, borderColor: portalPalette.line, borderRadius: AppTheme.radius.sm, borderWidth: 1, gap: 10, overflow: 'hidden', padding: 10 },
  catalogEditor: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.lineStrong,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  editorHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  editorTitle: { color: portalPalette.text, fontFamily: Typography.display, fontSize: 18, fontWeight: '900' },
  catalogToolbar: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  searchInput: { borderRadius: AppTheme.radius.sm, borderWidth: 1, flexBasis: 260, flexGrow: 1, fontFamily: Typography.body, fontSize: 13, minHeight: 40, paddingHorizontal: 12 },
  chipRow: { flexDirection: 'row', gap: 5 },
  filterChip: { backgroundColor: portalPalette.surfaceSoft, borderColor: portalPalette.line, borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5, transitionDuration: '0.2s', transitionProperty: 'background-color, border-color, transform', ':hover': { backgroundColor: 'rgba(255,255,255,0.075)' }, ':active': { transform: 'scale(0.96)' } },
  filterChipActive: { backgroundColor: portalPalette.infoSoft, borderColor: portalPalette.info },
  filterChipText: { color: portalPalette.text, fontFamily: Typography.body, fontSize: 10, fontWeight: '800' },
  catalogGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, minWidth: 0 },
  catalogCard: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexBasis: 230,
    flexDirection: 'column',
    flexGrow: 1,
    gap: 10,
    maxWidth: 360,
    padding: 12,
  },
  catalogCardContent: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  catalogCardActive: { backgroundColor: portalPalette.infoSoft, borderColor: portalPalette.accent },
  mapSelectToggle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
  },
  mapSelectButton: {
    alignItems: 'center',
    borderColor: portalPalette.lineStrong,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  mapSelectButtonActive: {
    backgroundColor: portalPalette.accent,
    borderColor: portalPalette.accent,
  },
  mapSelectText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  mapContainer: {
    gap: 8,
    minWidth: 0,
  },
  mapFallback: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 220,
  },
  mapFallbackText: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
  },
  mapHint: {
    color: portalPalette.info,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  coordPreview: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
    gap: 4,
    padding: 10,
  },
  coordText: {
    color: portalPalette.muted,
    fontFamily: Typography.mono,
    fontSize: 11,
  },
  continueButton: {
    alignItems: 'center',
    backgroundColor: '#EA1F23',
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    minWidth: 0,
  },
  input: {
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flex: 1,
    flexBasis: 220,
    fontFamily: Typography.body,
    fontSize: 13,
    minHeight: 40,
    minWidth: 0,
    paddingHorizontal: 12,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
  },
  segment: {
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexShrink: 1,
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  segmentText: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  segmentDriver: {
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 7,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
    transitionDuration: '0.2s',
    transitionProperty: 'box-shadow, transform, opacity',
    ':active': { transform: 'scale(0.97)' },
  },
  primaryText: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  list: {
    gap: 10,
    minWidth: 0,
  },
  routeRow: {
    alignItems: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    minWidth: 0,
    padding: 12,
  },
  routeIcon: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    flexShrink: 0,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  routeBody: {
    flex: 1,
    flexBasis: 260,
    minWidth: 0,
  },
  routeName: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
    minWidth: 0,
  },
  routeMeta: {
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
    minWidth: 0,
  },
  rowActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8,
  },
  iconAction: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    flexShrink: 0,
    height: 34,
    justifyContent: 'center',
    transitionDuration: '0.2s',
    transitionProperty: 'background-color, transform',
    width: 34,
    ':active': { transform: 'scale(0.92)' },
  },
  continuityBanner: {
    alignItems: 'center',
    backgroundColor: portalPalette.info,
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    minWidth: 0,
    padding: 12,
    shadowColor: portalPalette.info,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 4,
  },
  continuityText: {
    color: '#FFFFFF',
    flex: 1,
    flexBasis: 200,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
    minWidth: 0,
  },
  continuityButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
  },
  continuityButtonText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  deleteRouteButton: {
    alignItems: 'center',
    backgroundColor: portalPalette.dangerSoft,
    borderRadius: 8,
    flexShrink: 0,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  disabledButton: {
    opacity: 0.55,
  },
});
