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
import type { GeoPoint, SavedRoute, Vehicle } from '@/src/types/app';
import { createSavedRouteRequest, deleteSavedRouteRequest, getApiErrorMessage, getSavedRoutesRequest } from '@/src/lib/api';
import { PortalSectionCard } from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
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
  const [showRouteEditor, setShowRouteEditor] = useState(false);
  const [routeName, setRouteName] = useState('');

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

  const createCatalogRoute = async () => {
    const origin = editorPoints[0];
    const destination = editorPoints[1];
    if (!routeName.trim() || !origin || !destination || !editor.originLabel.trim() || !editor.destinationLabel.trim()) {
      setMessage('Completa nombre, origen y destino de la nueva ruta.');
      return;
    }
    setCatalogBusy(true);
    try {
      const route = await createSavedRouteRequest({
        name: routeName.trim(), origin, destination,
        originLabel: editor.originLabel.trim(), destinationLabel: editor.destinationLabel.trim(), stops: [],
        route: { label: routeName.trim(), distanceMeters: 0, durationSeconds: 0, durationInTrafficSeconds: 0, polyline: [origin, destination] },
      });
      setSavedRoutes((current) => [route, ...current]);
      setSelectedRouteId(route.id);
      setShowRouteEditor(false);
      setRouteName('');
      setMessage('Ruta guardada en el catálogo.');
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible guardar la ruta.'));
    } finally { setCatalogBusy(false); }
  };

  const assignSavedRoute = async () => {
    if (!editor.vehicleId || !selectedSavedRoute) return setMessage('Selecciona una unidad y una ruta.');
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

    const originLatitude = parseCoordinate(editor.originLatitude, -90, 90);
    const originLongitude = parseCoordinate(editor.originLongitude, -180, 180);
    const destinationLatitude = parseCoordinate(editor.destinationLatitude, -90, 90);
    const destinationLongitude = parseCoordinate(editor.destinationLongitude, -180, 180);

    const result = await assignRoute({
      vehicleId: editor.vehicleId,
      originLabel: editor.originLabel.trim(),
      destinationLabel: editor.destinationLabel.trim(),
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

  if (showRouteEditor) {
    return (
      <PortalLayout title="Editor de ruta" subtitle="Crea la ruta agregando sus puntos y guarda el resultado en el catálogo.">
        <View style={styles.fullEditorShell}>
          <View style={styles.editorTools}>
            <Pressable style={styles.toolButton}><MaterialCommunityIcons name="map-marker-plus" size={18} color={portalPalette.accent} /><Text style={styles.toolText}>Agregar parada</Text></Pressable>
            <Pressable style={styles.toolButton}><MaterialCommunityIcons name="flag-plus" size={18} color={portalPalette.info} /><Text style={styles.toolText}>Agregar checkpoint</Text></Pressable>
            <Pressable style={styles.toolButton}><MaterialCommunityIcons name="cursor-move" size={18} color={portalPalette.text} /><Text style={styles.toolText}>Mover punto</Text></Pressable>
            <Pressable onPress={() => setEditor(createBlankEditor(editor.vehicleId))} style={styles.toolButton}><MaterialCommunityIcons name="delete-sweep" size={18} color={palette.warning} /><Text style={styles.toolText}>Limpiar ruta</Text></Pressable>
          </View>
          <View style={styles.editorMap}>
            <Suspense fallback={<View style={styles.mapFallback}><Text style={styles.mapFallbackText}>Cargando mapa...</Text></View>}>
              <RouteMap height="100%" onClickPoint={(point) => {
                if (!editorPoints[0]) { setField('originLatitude', String(point.latitude)); setField('originLongitude', String(point.longitude)); }
                else { setField('destinationLatitude', String(point.latitude)); setField('destinationLongitude', String(point.longitude)); }
              }} routeCoordinates={editorPoints} vehicles={[]} />
            </Suspense>
          </View>
          <View style={styles.editorDetails}>
            <Text style={styles.editorTitle}>Detalles de la ruta</Text>
            <TextInput value={routeName} onChangeText={setRouteName} placeholder="Nombre de la ruta" placeholderTextColor={palette.muted} style={[styles.input, { borderColor: palette.lineStrong, color: palette.text }]} />
            <TextInput value={editor.originLabel} onChangeText={(value) => setField('originLabel', value)} placeholder="Origen" placeholderTextColor={palette.muted} style={[styles.input, { borderColor: palette.lineStrong, color: palette.text }]} />
            <TextInput value={editor.destinationLabel} onChangeText={(value) => setField('destinationLabel', value)} placeholder="Destino" placeholderTextColor={palette.muted} style={[styles.input, { borderColor: palette.lineStrong, color: palette.text }]} />
            <Text style={styles.coordText}>Haz clic en el mapa para definir origen y destino.</Text>
            <View style={styles.editorFooter}><Pressable onPress={() => setShowRouteEditor(false)} style={styles.secondaryButton}><Text style={styles.toolText}>Cancelar</Text></Pressable><Pressable disabled={catalogBusy} onPress={() => void createCatalogRoute()} style={[styles.primaryButton, portalButtonGradient()]}><Text style={styles.primaryText}>Guardar ruta</Text></Pressable></View>
          </View>
        </View>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Rutas" subtitle="Asignacion real de origen y destino por unidad.">
      {showAssignmentBanner && canManageRoutes ? (
        <View style={styles.continuityBanner}>
          <MaterialCommunityIcons name="check-circle" size={18} color="#FFFFFF" />
          <Text style={styles.continuityText}>Ruta asignada. Abre el centro de operaciones para monitorear la unidad.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/portal' as never)} style={styles.continuityButton}>
            <Text style={styles.continuityButtonText}>Ir a operaciones</Text>
            <MaterialCommunityIcons name="arrow-right" size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : null}

      {canManageRoutes ? (
        <PortalSectionCard title="Catálogo de rutas" subtitle={`${savedRoutes.length} rutas disponibles`} right={(
          <Pressable onPress={() => setShowRouteEditor(true)} style={[styles.primaryButton, portalButtonGradient()]}>
            <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" /><Text style={styles.primaryText}>Nueva ruta</Text>
          </Pressable>
        )}>
          <Text style={styles.sectionEyebrow}>1. Selecciona una unidad</Text>
          <View style={styles.segmentRow}>{routeVehicles.map((vehicle) => <Pressable key={vehicle.id} onPress={() => setField('vehicleId', vehicle.id)} style={[styles.segment, editor.vehicleId === vehicle.id ? styles.catalogCardActive : undefined]}><Text style={styles.segmentText}>{vehicle.code}</Text><Text style={styles.segmentDriver}>{getDriverName(vehicle)}</Text></Pressable>)}</View>
          <Text style={styles.sectionEyebrow}>2. Selecciona una ruta existente</Text>
          {savedRoutes.length ? <View style={styles.catalogGrid}>{savedRoutes.map((route) => (
            <Pressable key={route.id} onPress={() => setSelectedRouteId(route.id)} style={[styles.catalogCard, selectedRouteId === route.id ? styles.catalogCardActive : undefined]}>
              <View style={styles.routeBody}><Text style={styles.routeName}>{route.name}</Text><Text style={styles.routeMeta}>{route.originLabel || 'Origen'} → {route.destinationLabel || 'Destino'}</Text><Text style={styles.routeMeta}>{Math.round((route.distanceMeters || 0) / 1000)} km · {route.stops?.length || 0} paradas</Text></View>
              <Pressable accessibilityLabel={`Eliminar ${route.name}`} onPress={async (event) => { event.stopPropagation(); setCatalogBusy(true); try { await deleteSavedRouteRequest(route.id); setSavedRoutes((current) => current.filter((item) => item.id !== route.id)); if (selectedRouteId === route.id) setSelectedRouteId(null); } catch (error) { setMessage(getApiErrorMessage(error, 'No fue posible eliminar la ruta.')); } finally { setCatalogBusy(false); } }}><MaterialCommunityIcons name="delete-outline" size={19} color={palette.warning} /></Pressable>
            </Pressable>
          ))}</View> : <EmptyState icon="routes" title="Aún no hay rutas" description="Crea la primera ruta reutilizable para después asignarla a una unidad." />}
          {selectedSavedRoute ? <View style={styles.previewPanel}><Suspense fallback={<View style={styles.mapFallback}><Text style={styles.mapFallbackText}>Cargando vista previa...</Text></View>}><RouteMap checkpoints={selectedSavedRoute.stops} height={300} routeCoordinates={selectedSavedRoute.polyline} vehicles={[]} /></Suspense><View><Text style={styles.routeName}>{selectedSavedRoute.name}</Text><Text style={styles.routeMeta}>{Math.round((selectedSavedRoute.distanceMeters || 0) / 1000)} km · {Math.round((selectedSavedRoute.durationSeconds || 0) / 60)} min · {selectedSavedRoute.stops.length} paradas</Text></View></View> : null}
          <View style={styles.actions}><Pressable disabled={!selectedSavedRoute || !editor.vehicleId || isSubmitting} onPress={() => void assignSavedRoute()} style={[styles.primaryButton, portalButtonGradient(), (!selectedSavedRoute || !editor.vehicleId) ? styles.disabledButton : undefined]}><MaterialCommunityIcons name="link-variant" size={18} color="#FFFFFF" /><Text style={styles.primaryText}>Asignar ruta seleccionada</Text></Pressable></View>
        </PortalSectionCard>
      ) : null}

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
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void saveRoute()}
                  disabled={isSubmitting}
                  style={[styles.primaryButton, portalButtonGradient(), isSubmitting ? styles.disabledButton : undefined]}>
                  <MaterialCommunityIcons name="map-marker-path" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryText}>Asignar ruta</Text>
                </Pressable>
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
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Editar ruta de ${vehicle.code}`}
                          onPress={() => loadRoute(vehicle)}
                          style={[styles.iconAction, { backgroundColor: palette.infoSoft }]}>
                          <MaterialCommunityIcons name="pencil-outline" size={18} color={palette.info} />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Liberar ruta de ${vehicle.code}`}
                          onPress={() => setRouteToClear(vehicle)}
                          disabled={isSubmitting}
                          style={[styles.iconAction, { backgroundColor: palette.warningSoft }]}>
                          <MaterialCommunityIcons name="link-off" size={18} color={palette.warning} />
                        </Pressable>
                        {routeVehicles.length > 1 ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Duplicar ruta de ${vehicle.code}`}
                            onPress={() => setDuplicateSourceId(vehicle.id)}
                            disabled={isSubmitting}
                            style={[styles.iconAction, { backgroundColor: palette.surfaceAlt }]}>
                            <MaterialCommunityIcons name="content-copy" size={18} color={palette.text} />
                          </Pressable>
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
  fullEditorShell: { flexDirection: 'row', gap: 10, minHeight: 650, minWidth: 0 },
  editorTools: { backgroundColor: portalPalette.surface, borderColor: portalPalette.line, borderRadius: AppTheme.radius.sm, borderWidth: 1, flexBasis: 180, gap: 8, padding: 12 },
  editorMap: { flex: 1, minHeight: 650, minWidth: 320 },
  editorDetails: { backgroundColor: portalPalette.surface, borderColor: portalPalette.line, borderRadius: AppTheme.radius.sm, borderWidth: 1, flexBasis: 300, gap: 12, padding: 14 },
  toolButton: { alignItems: 'center', backgroundColor: portalPalette.surfaceSoft, borderColor: portalPalette.line, borderRadius: AppTheme.radius.xs, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 42, paddingHorizontal: 10 },
  toolText: { color: portalPalette.text, fontFamily: Typography.body, fontSize: 12, fontWeight: '800' },
  editorFooter: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 'auto' },
  secondaryButton: { alignItems: 'center', borderColor: portalPalette.lineStrong, borderRadius: AppTheme.radius.sm, borderWidth: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 14 },
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
  catalogGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, minWidth: 0 },
  catalogCard: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexBasis: 230,
    flexDirection: 'row',
    flexGrow: 1,
    gap: 10,
    maxWidth: 360,
    padding: 12,
  },
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
    fontSize: 14,
    minHeight: 46,
    minWidth: 0,
    paddingHorizontal: 14,
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
    gap: 8,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 14,
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
    height: 36,
    justifyContent: 'center',
    width: 36,
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
  disabledButton: {
    opacity: 0.55,
  },
});
