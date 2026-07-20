import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, palette, Typography } from '@/constants/theme';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge, type StatusBadgeTone } from '@/src/components/ui/status-badge';
import { useAppStore } from '@/src/store/use-app-store';
import type { Vehicle, VehicleMutationPayload, VehicleStatus } from '@/src/types/app';
import { formatDate } from '@/src/utils/format';
import { PortalSectionCard } from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { PortalButton } from '../components/portal-button';
import { PortalDataList, PortalDataRow } from '../components/portal-data-list';
import { portalButtonGradient, portalPalette } from '../portal-theme';

const MAINTENANCE_INTERVAL_KM = 10000;

function getMaintenanceInfo(vehicle: Vehicle) {
  const km = Number(vehicle.currentKilometers);
  if (!Number.isFinite(km) || km <= 0) return null;
  const lastMaintenanceKm = vehicle.status === 'maintenance' ? km : Math.floor(km / MAINTENANCE_INTERVAL_KM) * MAINTENANCE_INTERVAL_KM;
  const nextMaintenanceKm = lastMaintenanceKm + MAINTENANCE_INTERVAL_KM;
  const kmRemaining = Math.max(0, nextMaintenanceKm - km);
  const overdue = kmRemaining === 0 && vehicle.status !== 'maintenance';
  return { lastMaintenanceKm, nextMaintenanceKm, kmRemaining, overdue };
}

type UnitEditor = {
  code: string;
  plate: string;
  currentKilometers: string;
  status: string;
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
  const {
    createVehicle,
    deleteVehicle,
    isSubmitting,
    loadVehicles,
    updateVehicle,
    user,
    vehicles,
  } = useAppStore(
    useShallow((state) => ({
      createVehicle: state.createVehicle,
      deleteVehicle: state.deleteVehicle,
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
  const [statusTouched, setStatusTouched] = useState(false);
  const [showCreationBanner, setShowCreationBanner] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);

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
    setStatusTouched(false);
    setEditor(createBlankEditor());
  };

  const startEdit = (vehicle: Vehicle) => {
    setEditingId(vehicle.id);
    setStatusTouched(false);
    setEditor({
      code: vehicle.code,
      plate: vehicle.plate,
      currentKilometers:
        typeof vehicle.currentKilometers === 'number' && vehicle.currentKilometers > 0
          ? String(vehicle.currentKilometers)
          : '',
      status: vehicle.status,
    });
  };

  const saveUnit = async () => {
    if (isSubmitting) return;
    setMessage(null);

    const code = editor.code.trim();
    const plate = editor.plate.trim().toUpperCase();

    if (!code || !plate) {
      setMessage('Nombre y placas de unidad son obligatorios.');
      return;
    }

    if (code.length > 50) {
      setMessage('El nombre de la unidad no puede exceder 50 caracteres.');
      return;
    }

    if (plate.length > 20) {
      setMessage('Las placas no pueden exceder 20 caracteres.');
      return;
    }

    if (!/^[a-zA-Z0-9\u00C0-\u024F\s\-_./]+$/.test(code)) {
      setMessage('El nombre de la unidad contiene caracteres no validos.');
      return;
    }

    if (!/^[a-zA-Z0-9\u00C0-\u024F\s\-]+$/.test(plate)) {
      setMessage('Las placas contienen caracteres no validos.');
      return;
    }

    const kilometers = editor.currentKilometers.trim() ? Number(editor.currentKilometers) : undefined;

    if (typeof kilometers === 'number' && (!Number.isFinite(kilometers) || kilometers < 0)) {
      setMessage('Los kilometros deben ser un numero valido.');
      return;
    }

    if (typeof kilometers === 'number' && kilometers > 9999999) {
      setMessage('El kilometraje ingresado es demasiado alto.');
      return;
    }

    const statusPayload = !editingId || statusTouched ? { status: editor.status as VehicleStatus } : {};
    const payload = {
      code,
      plate,
      currentKilometers: kilometers,
      ...statusPayload,
    } as VehicleMutationPayload;
    const result = editingId ? await updateVehicle(editingId, payload) : await createVehicle(payload);

    if (!result.ok) {
      setMessage(result.message || 'No fue posible guardar la unidad.');
      return;
    }

    resetEditor();
    setMessage(editingId ? 'Unidad actualizada.' : 'Unidad creada.');
    if (!editingId) setShowCreationBanner(true);
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
              placeholderTextColor={palette.muted}
              style={[styles.input, { borderColor: palette.lineStrong, color: palette.text }]}
            />
            <TextInput
              value={editor.plate}
              onChangeText={(value) => setField('plate', value)}
              placeholder="Placas"
              placeholderTextColor={palette.muted}
              autoCapitalize="characters"
              style={[styles.input, { borderColor: palette.lineStrong, color: palette.text }]}
            />
            <TextInput
              value={editor.currentKilometers}
              onChangeText={(value) => setField('currentKilometers', value.replace(/[^0-9.]/g, ''))}
              placeholder="Kilometros actuales"
              placeholderTextColor={palette.muted}
              keyboardType="numeric"
              style={[styles.input, { borderColor: palette.lineStrong, color: palette.text }]}
            />
          </View>
          <View style={styles.segmentRow}>
            {editableStatuses.map((status) => (
              <Pressable
                key={status}
                accessibilityRole="button"
                onPress={() => {
                  setField('status', status);
                  setStatusTouched(true);
                }}
                style={[
                  styles.segment,
                  {
                    backgroundColor: editor.status === status ? palette.infoSoft : palette.surfaceAlt,
                    borderColor: editor.status === status ? palette.info : palette.line,
                  },
                ]}>
                <Text style={[styles.segmentText, { color: editor.status === status ? palette.info : palette.text }]}>
                  {status === 'maintenance' ? 'Mantenimiento' : 'Disponible'}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.actions}>
            {editingId ? (
              <PortalButton onPress={resetEditor} variant="secondary">Cancelar</PortalButton>
            ) : null}
            <PortalButton icon={editingId ? 'content-save-outline' : 'bus-multiple'} loading={isSubmitting} onPress={() => void saveUnit()}>{editingId ? 'Guardar' : 'Crear unidad'}</PortalButton>
          </View>
        </PortalSectionCard>
      ) : null}

        {showCreationBanner && canManageUnits ? (
          <View style={[styles.continuityBanner, { backgroundColor: palette.infoSoft, borderColor: palette.line }]}>
            <MaterialCommunityIcons name="check-circle" size={18} color={palette.info} />
            <Text style={[styles.continuityText, { color: palette.text }]}>Unidad creada. El siguiente paso es asignar una ruta.</Text>
            <PortalButton icon="arrow-right" onPress={() => router.push('/portal/rutas' as never)} size="sm">Asignar ruta</PortalButton>
          </View>
        ) : null}

        <PortalSectionCard
          title="Unidades registradas"
          subtitle={`${sortedVehicles.length} ${sortedVehicles.length === 1 ? 'unidad real' : 'unidades reales'}`}
          right={sortedVehicles.length && canManageUnits ? (
            <PortalButton onPress={() => router.push('/portal/rutas' as never)} variant="secondary">Continuar a rutas</PortalButton>
          ) : undefined}>
          {sortedVehicles.length ? (
          <PortalDataList>
            {sortedVehicles.map((vehicle) => {
              const status = getUnitStatus(vehicle);
              const routeLabel = vehicle.assignedRoute
                ? `${vehicle.assignedRoute.originLabel || 'Origen'} -> ${vehicle.assignedRoute.destinationLabel || 'Destino'}`
                : null;
              return (
                <PortalDataRow key={vehicle.id} leading={<View style={[styles.unitIcon, { backgroundColor: palette.surfaceAlt }]}>
                    <MaterialCommunityIcons name="bus" size={21} color={palette.accent} />
                  </View>} body={<>
                    <Text style={[styles.unitName, { color: palette.text }]}>{vehicle.code}</Text>
                    <Text style={[styles.unitMeta, { color: palette.muted }]}>
                      {vehicle.plate} · {getKilometersLabel(vehicle.currentKilometers)}
                    </Text>
                    <Text style={[styles.unitMeta, { color: palette.muted }]}>
                      Conductor: {vehicle.driver?.name || vehicle.driverName || 'Sin conductor'}
                    </Text>
                    {routeLabel ? (
                      <Text style={[styles.unitMeta, { color: palette.muted }]} numberOfLines={1}>
                        Ruta: {routeLabel}
                      </Text>
                    ) : null}
                    {vehicle.locationTimestamp ? (
                      <Text style={[styles.unitMeta, { color: palette.muted }]}>
                        Última actividad: {formatDate(vehicle.locationTimestamp, { fallback: 'Sin registro' })}
                      </Text>
                    ) : null}
                    {(() => {
                      const maintenance = getMaintenanceInfo(vehicle);
                      if (!maintenance) return null;
                      return (
                        <View style={[styles.maintenanceRow, { borderColor: maintenance.overdue ? palette.dangerSoft : palette.line }]}>
                          <MaterialCommunityIcons
                            name={maintenance.overdue ? 'alert-circle-outline' : 'wrench-outline'}
                            size={14}
                            color={maintenance.overdue ? palette.danger : palette.muted}
                          />
                          <Text style={[styles.unitMeta, { color: maintenance.overdue ? palette.danger : palette.muted }]}>
                            {maintenance.overdue
                              ? `Mantenimiento vencido (${maintenance.kmRemaining.toLocaleString('es-MX')} km excedidos)`
                              : `Próximo mantenimiento: ${maintenance.kmRemaining.toLocaleString('es-MX')} km`}
                          </Text>
                        </View>
                      );
                    })()}
                  </>} meta={<StatusBadge label={status.label} tone={status.tone} />} actions={canManageUnits ? <View style={styles.rowActions}>
                      <PortalButton
                        accessibilityLabel={`Editar unidad ${vehicle.code}`}
                        onPress={() => startEdit(vehicle)}
                        icon="pencil-outline"
                        size="sm"
                        variant="icon" />
                      <PortalButton
                        accessibilityLabel={`Eliminar unidad ${vehicle.code}`}
                        onPress={() => setDeleteTarget(vehicle)}
                        icon="trash-can-outline"
                        size="sm"
                        variant="danger" />
                    </View> : undefined} />
              );
            })}
          </PortalDataList>
        ) : (
          <EmptyState
            icon="bus-alert"
            title="Sin unidades registradas"
            description="Crea la primera unidad real de la empresa antes de asignar conductores o rutas."
          />
        )}
      </PortalSectionCard>

      <ConfirmModal
        visible={Boolean(deleteTarget)}
        destructive
        title={`Eliminar unidad "${deleteTarget?.code || ''}"`}
        description={
          deleteTarget
            ? (deleteTarget.driverId
                ? `No es posible eliminar esta unidad porque tiene un conductor asignado. Desasigne el conductor antes de continuar.`
                : deleteTarget.routeId || deleteTarget.assignedRoute
                  ? `No es posible eliminar esta unidad porque tiene una ruta asignada. Desasigne la ruta antes de continuar.`
                  : `Esta acción eliminará la unidad "${deleteTarget.code}" (${deleteTarget.plate}) del catálogo.`)
            : ''
        }
        confirmLabel="Eliminar"
        processing={isSubmitting}
        onCancel={() => {
          setDeleteTarget(null);
          setMessage(null);
        }}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const result = await deleteVehicle(deleteTarget.id);
          setMessage(result.ok ? 'Unidad eliminada.' : result.message || 'No fue posible eliminar la unidad.');
          if (result.ok) setDeleteTarget(null);
        }}
      />
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
  maintenanceRow: {
    alignItems: 'center',
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  continuityBanner: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 12,
  },
  continuityText: {
    flex: 1,
    flexBasis: 200,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
    minWidth: 0,
  },
  continuityButton: {
    alignItems: 'center',
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
