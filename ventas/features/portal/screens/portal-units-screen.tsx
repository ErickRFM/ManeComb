import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge, type StatusBadgeTone } from '@/src/components/ui/status-badge';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type { Vehicle, VehicleStatus } from '@/src/types/app';
import { formatDate } from '@/src/utils/format';
import { PortalSectionCard } from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { portalButtonGradient, portalPalette } from '../portal-theme';

type UnitEditor = {
  code: string;
  plate: string;
  currentKilometers: string;
  status: Exclude<VehicleStatus, 'assigned'>;
};

const editableStatuses: UnitEditor['status'][] = ['available', 'maintenance'];

function createBlankEditor(): UnitEditor {
  return {
    code: '',
    plate: '',
    currentKilometers: '',
    status: 'available',
  };
}

function getUnitStatus(vehicle: Vehicle): { label: string; tone: StatusBadgeTone } {
  if (vehicle.status === 'maintenance') {
    return { label: 'Mantenimiento', tone: 'warning' };
  }

  if (vehicle.driverId) {
    return { label: 'Asignada', tone: 'positive' };
  }

  return { label: 'Disponible', tone: 'info' };
}

function getKilometersLabel(value: unknown) {
  const kilometers = Number(value);
  return Number.isFinite(kilometers) && kilometers > 0
    ? `${kilometers.toLocaleString('es-MX')} km`
    : 'Sin kilometraje registrado';
}

export function PortalUnitsScreen() {
  const { theme } = useAppTheme();
  const {
    createVehicle,
    isSubmitting,
    loadVehicles,
    updateVehicle,
    user,
    vehicles,
  } = useAppStore(
    useShallow((state) => ({
      createVehicle: state.createVehicle,
      isSubmitting: state.isSubmitting,
      loadVehicles: state.loadVehicles,
      updateVehicle: state.updateVehicle,
      user: state.user,
      vehicles: state.vehicles,
    }))
  );
  const canManageUnits = Boolean(user && ['owner', 'admin'].includes(user.role));
  const [editor, setEditor] = useState<UnitEditor>(createBlankEditor);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  const sortedVehicles = useMemo(
    () => [...vehicles].sort((left, right) => String(left.code || '').localeCompare(String(right.code || ''))),
    [vehicles]
  );
  const setField = <T extends keyof UnitEditor>(field: T, value: UnitEditor[T]) => {
    setEditor((current) => ({ ...current, [field]: value }));
  };

  const resetEditor = () => {
    setEditingId(null);
    setEditor(createBlankEditor());
  };

  const startEdit = (vehicle: Vehicle) => {
    setEditingId(vehicle.id);
    setEditor({
      code: vehicle.code,
      plate: vehicle.plate,
      currentKilometers:
        typeof vehicle.currentKilometers === 'number' && vehicle.currentKilometers > 0
          ? String(vehicle.currentKilometers)
          : '',
      status: vehicle.status === 'maintenance' ? 'maintenance' : 'available',
    });
  };

  const saveUnit = async () => {
    setMessage(null);

    if (!editor.code.trim() || !editor.plate.trim()) {
      setMessage('Nombre y placas de unidad son obligatorios.');
      return;
    }

    const kilometers = editor.currentKilometers.trim() ? Number(editor.currentKilometers) : undefined;

    if (typeof kilometers === 'number' && (!Number.isFinite(kilometers) || kilometers < 0)) {
      setMessage('Los kilometros deben ser un numero valido.');
      return;
    }

    const payload = {
      code: editor.code.trim(),
      plate: editor.plate.trim().toUpperCase(),
      currentKilometers: kilometers,
      status: editor.status,
    };
    const result = editingId ? await updateVehicle(editingId, payload) : await createVehicle(payload);

    if (!result.ok) {
      setMessage(result.message || 'No fue posible guardar la unidad.');
      return;
    }

    resetEditor();
    setMessage(editingId ? 'Unidad actualizada.' : 'Unidad creada.');
  };

  return (
    <PortalLayout title="Unidades" subtitle="Alta y estado administrativo de las unidades reales de la empresa.">
      {canManageUnits ? (
        <PortalSectionCard
          title={editingId ? 'Editar unidad' : 'Crear unidad'}
          subtitle={message || undefined}>
          <View style={styles.formGrid}>
            <TextInput
              value={editor.code}
              onChangeText={(value) => setField('code', value)}
              placeholder="Nombre de unidad"
              placeholderTextColor={theme.colors.muted}
              style={[styles.input, { borderColor: theme.colors.lineStrong, color: theme.colors.text }]}
            />
            <TextInput
              value={editor.plate}
              onChangeText={(value) => setField('plate', value)}
              placeholder="Placas"
              placeholderTextColor={theme.colors.muted}
              autoCapitalize="characters"
              style={[styles.input, { borderColor: theme.colors.lineStrong, color: theme.colors.text }]}
            />
            <TextInput
              value={editor.currentKilometers}
              onChangeText={(value) => setField('currentKilometers', value.replace(/[^0-9.]/g, ''))}
              placeholder="Kilometros actuales"
              placeholderTextColor={theme.colors.muted}
              keyboardType="numeric"
              style={[styles.input, { borderColor: theme.colors.lineStrong, color: theme.colors.text }]}
            />
          </View>
          <View style={styles.segmentRow}>
            {editableStatuses.map((status) => (
              <Pressable
                key={status}
                accessibilityRole="button"
                onPress={() => setField('status', status)}
                style={[
                  styles.segment,
                  {
                    backgroundColor: editor.status === status ? theme.colors.infoSoft : theme.colors.surfaceAlt,
                    borderColor: editor.status === status ? theme.colors.info : theme.colors.line,
                  },
                ]}>
                <Text style={[styles.segmentText, { color: editor.status === status ? theme.colors.info : theme.colors.text }]}>
                  {status === 'maintenance' ? 'Mantenimiento' : 'Disponible'}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.actions}>
            {editingId ? (
              <Pressable accessibilityRole="button" onPress={resetEditor} style={[styles.secondaryButton, { borderColor: theme.colors.line }]}>
                <Text style={[styles.secondaryText, { color: theme.colors.text }]}>Cancelar</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => void saveUnit()}
              disabled={isSubmitting}
              style={[styles.primaryButton, portalButtonGradient(), isSubmitting ? styles.disabledButton : undefined]}>
              <MaterialCommunityIcons name={editingId ? 'content-save-outline' : 'bus-multiple'} size={18} color="#FFFFFF" />
              <Text style={styles.primaryText}>{editingId ? 'Guardar' : 'Crear unidad'}</Text>
            </Pressable>
          </View>
        </PortalSectionCard>
      ) : null}

      <PortalSectionCard
        title="Unidades registradas"
        subtitle={`${sortedVehicles.length} ${sortedVehicles.length === 1 ? 'unidad real' : 'unidades reales'}`}>
          {sortedVehicles.length ? (
          <View style={styles.list}>
            {sortedVehicles.map((vehicle) => {
              const status = getUnitStatus(vehicle);
              const routeLabel = vehicle.assignedRoute
                ? `${vehicle.assignedRoute.originLabel || 'Origen'} -> ${vehicle.assignedRoute.destinationLabel || 'Destino'}`
                : null;
              return (
                <View key={vehicle.id} style={[styles.unitRow, { borderColor: theme.colors.line, backgroundColor: theme.colors.surface }]}>
                  <View style={[styles.unitIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
                    <MaterialCommunityIcons name="bus" size={21} color={theme.colors.accent} />
                  </View>
                  <View style={styles.unitBody}>
                    <Text style={[styles.unitName, { color: theme.colors.text }]}>{vehicle.code}</Text>
                    <Text style={[styles.unitMeta, { color: theme.colors.muted }]}>
                      {vehicle.plate} · {getKilometersLabel(vehicle.currentKilometers)}
                    </Text>
                    <Text style={[styles.unitMeta, { color: theme.colors.muted }]}>
                      Conductor: {vehicle.driver?.name || vehicle.driverName || 'Sin conductor'}
                    </Text>
                    {routeLabel ? (
                      <Text style={[styles.unitMeta, { color: theme.colors.muted }]} numberOfLines={1}>
                        Ruta: {routeLabel}
                      </Text>
                    ) : null}
                    {vehicle.locationTimestamp ? (
                      <Text style={[styles.unitMeta, { color: theme.colors.muted }]}>
                        Última actividad: {formatDate(vehicle.locationTimestamp, { fallback: 'Sin registro' })}
                      </Text>
                    ) : null}
                  </View>
                  <StatusBadge label={status.label} tone={status.tone} />
                  {canManageUnits ? (
                    <View style={styles.rowActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Editar unidad ${vehicle.code}`}
                        onPress={() => startEdit(vehicle)}
                        style={[styles.iconAction, { backgroundColor: theme.colors.infoSoft }]}>
                        <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.colors.info} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <EmptyState
            icon="bus-alert"
            title="Sin unidades registradas"
            description="Crea la primera unidad real de la empresa antes de asignar conductores o rutas."
          />
        )}
      </PortalSectionCard>
    </PortalLayout>
  );
}

const styles = StyleSheet.create({
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
  secondaryButton: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 14,
  },
  secondaryText: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  list: {
    gap: 10,
    minWidth: 0,
  },
  unitRow: {
    alignItems: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    minWidth: 0,
    padding: 12,
  },
  unitIcon: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    flexShrink: 0,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  unitBody: {
    flex: 1,
    flexBasis: 260,
    minWidth: 0,
  },
  unitName: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
    minWidth: 0,
  },
  unitMeta: {
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
  operationalFacts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    minWidth: 0,
  },
  quickAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 9,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  quickActionText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
  },
  unitFact: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
    flex: 1,
    flexBasis: 125,
    gap: 3,
    minWidth: 0,
    padding: 9,
  },
  unitFactLabel: {
    color: '#A8B1C2',
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
  },
  unitFactValue: {
    color: '#F4F7FB',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
  },
  disabledButton: {
    opacity: 0.55,
  },
});
