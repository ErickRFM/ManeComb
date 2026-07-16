import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type { Vehicle } from '@/src/types/app';
import { PortalSectionCard } from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { portalButtonGradient } from '../portal-theme';

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
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max ? coordinate : null;
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
  const { theme } = useAppTheme();
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
  const [message, setMessage] = useState<string | null>(null);
  const [routeToClear, setRouteToClear] = useState<Vehicle | null>(null);
  const [duplicateSourceId, setDuplicateSourceId] = useState<string | null>(null);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

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

  return (
    <PortalLayout title="Rutas" subtitle="Asignacion real de origen y destino por unidad.">
      {canManageRoutes ? (
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
                    onPress={() => setField('vehicleId', vehicle.id)}
                    style={[
                      styles.segment,
                      {
                        backgroundColor: editor.vehicleId === vehicle.id ? theme.colors.infoSoft : theme.colors.surfaceAlt,
                        borderColor: editor.vehicleId === vehicle.id ? theme.colors.info : theme.colors.line,
                      },
                    ]}>
                    <Text style={[styles.segmentText, { color: editor.vehicleId === vehicle.id ? theme.colors.info : theme.colors.text }]}>
                      {vehicle.code}
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
                  placeholderTextColor={theme.colors.muted}
                  style={[styles.input, { borderColor: theme.colors.lineStrong, color: theme.colors.text }]}
                />
                <TextInput
                  value={editor.destinationLabel}
                  onChangeText={(value) => setField('destinationLabel', value)}
                   placeholder="Destino"
                   accessibilityLabel="Destino"
                  placeholderTextColor={theme.colors.muted}
                  style={[styles.input, { borderColor: theme.colors.lineStrong, color: theme.colors.text }]}
                />
                <TextInput
                  value={editor.originLatitude}
                  onChangeText={(value) => setField('originLatitude', value.replace(/[^0-9.-]/g, ''))}
                   placeholder="Latitud origen"
                   accessibilityLabel="Latitud de origen"
                  placeholderTextColor={theme.colors.muted}
                  keyboardType="numeric"
                  style={[styles.input, { borderColor: theme.colors.lineStrong, color: theme.colors.text }]}
                />
                <TextInput
                  value={editor.originLongitude}
                  onChangeText={(value) => setField('originLongitude', value.replace(/[^0-9.-]/g, ''))}
                   placeholder="Longitud origen"
                   accessibilityLabel="Longitud de origen"
                  placeholderTextColor={theme.colors.muted}
                  keyboardType="numeric"
                  style={[styles.input, { borderColor: theme.colors.lineStrong, color: theme.colors.text }]}
                />
                <TextInput
                  value={editor.destinationLatitude}
                  onChangeText={(value) => setField('destinationLatitude', value.replace(/[^0-9.-]/g, ''))}
                   placeholder="Latitud destino"
                   accessibilityLabel="Latitud de destino"
                  placeholderTextColor={theme.colors.muted}
                  keyboardType="numeric"
                  style={[styles.input, { borderColor: theme.colors.lineStrong, color: theme.colors.text }]}
                />
                <TextInput
                  value={editor.destinationLongitude}
                  onChangeText={(value) => setField('destinationLongitude', value.replace(/[^0-9.-]/g, ''))}
                   placeholder="Longitud destino"
                   accessibilityLabel="Longitud de destino"
                  placeholderTextColor={theme.colors.muted}
                  keyboardType="numeric"
                  style={[styles.input, { borderColor: theme.colors.lineStrong, color: theme.colors.text }]}
                />
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

      {sortedVehicles.length ? <PortalSectionCard
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
              <View key={vehicle.id} style={[styles.routeRow, { borderColor: theme.colors.line, backgroundColor: theme.colors.surface }]}>
                <View style={[styles.routeIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
                  <MaterialCommunityIcons name="routes" size={21} color={theme.colors.accent} />
                </View>
                <View style={styles.routeBody}>
                  <Text style={[styles.routeName, { color: theme.colors.text }]}>{vehicle.code}</Text>
                  <Text style={[styles.routeMeta, { color: theme.colors.muted }]}>{getRouteLabel(vehicle)}</Text>
                  <Text style={[styles.routeMeta, { color: theme.colors.muted }]}>
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
                          style={[styles.iconAction, { backgroundColor: theme.colors.infoSoft }]}>
                          <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.colors.info} />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Liberar ruta de ${vehicle.code}`}
                          onPress={() => setRouteToClear(vehicle)}
                          disabled={isSubmitting}
                          style={[styles.iconAction, { backgroundColor: theme.colors.warningSoft }]}>
                          <MaterialCommunityIcons name="link-off" size={18} color={theme.colors.warning} />
                        </Pressable>
                        {routeVehicles.length > 1 ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Duplicar ruta de ${vehicle.code}`}
                            onPress={() => setDuplicateSourceId(vehicle.id)}
                            disabled={isSubmitting}
                            style={[styles.iconAction, { backgroundColor: theme.colors.surfaceAlt }]}>
                            <MaterialCommunityIcons name="content-copy" size={18} color={theme.colors.text} />
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
    </PortalLayout>
  );
}

const styles = StyleSheet.create({
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
  disabledButton: {
    opacity: 0.55,
  },
});
