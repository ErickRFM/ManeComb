import { router } from '@/src/navigation/router';
import { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { palette } from '@/constants/theme';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { getVehicleLifecycleImpactRequest } from '@/src/api/client';
import { useAppStore } from '@/src/store/use-app-store';
import type { Vehicle, VehicleLifecycleImpact, VehicleMutationPayload, VehicleStatus } from '@/src/types/app';
import { PortalLayout } from '../components/portal-layout';
import { PortalButton } from '../components/portal-button';
import { PortalSectionCard } from '../cards';
import { PortalUnitForm } from '../units/components/portal-unit-form';
import { PortalUnitsContinuityBanner } from '../units/components/portal-units-continuity-banner';
import { PortalUnitsList } from '../units/components/portal-units-list';
import type { UnitEditor } from '../units/units.types';
import { createBlankEditor } from '../units/units.utils';
import { hasPortalPermission } from '../utils/access';
import { styles } from '../units/units.styles';

export function PortalUnitsScreen() {
  const {
    createVehicle,
    deleteVehicle,
    isSubmitting,
    loadVehicles,
    operationalUnits,
    updateVehicle,
    retireVehicle,
    user,
    vehicles,
  } = useAppStore(
    useShallow((state) => ({
      createVehicle: state.createVehicle,
      deleteVehicle: state.deleteVehicle,
      isSubmitting: state.isSubmitting,
      loadVehicles: state.loadVehicles,
      operationalUnits: state.operationalUnits,
      updateVehicle: state.updateVehicle,
      retireVehicle: state.retireVehicle,
      user: state.user,
      vehicles: state.vehicles,
    }))
  );
  const canManageUnits = hasPortalPermission(user, 'vehicles');
  const [editor, setEditor] = useState<UnitEditor>(createBlankEditor);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusTouched, setStatusTouched] = useState(false);
  const [showCreationBanner, setShowCreationBanner] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [lifecycleImpact, setLifecycleImpact] = useState<VehicleLifecycleImpact | null>(null);
  const [retirementReason, setRetirementReason] = useState('Renovacion de flota');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'assigned' | 'maintenance'>('all');
  const [showRetired, setShowRetired] = useState(false);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  const sortedVehicles = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...vehicles]
      .filter((vehicle) => showRetired || !vehicle.retiredAt)
      .filter((vehicle) => !term || `${vehicle.code} ${vehicle.plate}`.toLowerCase().includes(term))
      .filter((vehicle) => statusFilter === 'all' || (statusFilter === 'assigned' ? Boolean(vehicle.driverId) : vehicle.status === statusFilter))
      .sort((left, right) => String(left.code || '').localeCompare(String(right.code || '')));
  }, [search, showRetired, statusFilter, vehicles]);
  const unitSummary = useMemo(() => ({
    total: vehicles.length,
    available: vehicles.filter((item) => !item.retiredAt && !item.driverId && item.status === 'available').length,
    assigned: vehicles.filter((item) => !item.retiredAt && Boolean(item.driverId)).length,
    maintenance: vehicles.filter((item) => !item.retiredAt && item.status === 'maintenance').length,
    retired: vehicles.filter((item) => Boolean(item.retiredAt)).length,
  }), [vehicles]);
  const hasAssignedRoute = Boolean(lifecycleImpact?.vehicle.routeId || lifecycleImpact?.vehicle.assignedRoute);
  const lifecycleConfirmDisabled = !lifecycleImpact || (
    !lifecycleImpact.canDeletePermanently &&
    (
      !lifecycleImpact.canRetire ||
      retirementReason.trim().length < 3
    )
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
    if (!canManageUnits) return;
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
    if (isSubmitting || !canManageUnits) return;
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

  const prepareVehicleLifecycle = async (vehicle: Vehicle) => {
    if (!canManageUnits) return;
    setDeleteTarget(vehicle);
    setLifecycleImpact(null);
    setRetirementReason('Renovacion de flota');
    try {
      setLifecycleImpact(await getVehicleLifecycleImpactRequest(vehicle.id));
    } catch {
      setMessage('No fue posible cargar las dependencias de la unidad.');
    }
  };

  return (
    <PortalLayout title="Unidades" subtitle="Alta y estado administrativo de las unidades reales de la empresa.">
      {canManageUnits ? (
        <PortalUnitForm
          editor={editor}
          editingId={editingId}
          isSubmitting={isSubmitting}
          message={message}
          onCancel={resetEditor}
          onFieldChange={setField}
          onSave={() => void saveUnit()}
          onStatusChange={(status) => {
            setField('status', status);
            setStatusTouched(true);
          }}
        />
      ) : null}

      {showCreationBanner && canManageUnits ? (
        <PortalUnitsContinuityBanner onAssignRoute={() => router.push('/portal/rutas' as never)} />
      ) : null}

      <PortalSectionCard compact title="Resumen de flota" subtitle="Estado administrativo y operativo de las unidades.">
        <View style={styles.summaryGrid}>
          {[
            ['Total', unitSummary.total],
            ['Disponibles', unitSummary.available],
            ['Asignadas', unitSummary.assigned],
            ['Mantenimiento', unitSummary.maintenance],
            ['Retiradas', unitSummary.retired],
          ].map(([label, value]) => (
            <View key={String(label)} style={[styles.summaryItem, { borderColor: palette.line, backgroundColor: palette.surfaceAlt }]}>
              <Text style={[styles.unitMeta, { color: palette.muted }]}>{label}</Text>
              <Text style={[styles.summaryValue, { color: palette.text }]}>{value}</Text>
            </View>
          ))}
        </View>
        <View style={styles.filterBar}>
          <TextInput
            accessibilityLabel="Buscar unidad"
            placeholder="Buscar por codigo o placas"
            placeholderTextColor={palette.muted}
            value={search}
            onChangeText={setSearch}
            style={[styles.input, { borderColor: palette.line, color: palette.text, backgroundColor: palette.surface }]}
          />
          {(['all', 'available', 'assigned', 'maintenance'] as const).map((filter) => (
            <PortalButton key={filter} onPress={() => setStatusFilter(filter)} size="sm" variant={statusFilter === filter ? 'primary' : 'secondary'}>
              {filter === 'all' ? 'Todas' : filter === 'available' ? 'Disponibles' : filter === 'assigned' ? 'Asignadas' : 'Mantenimiento'}
            </PortalButton>
          ))}
          <PortalButton
            onPress={() => {
              const next = !showRetired;
              setShowRetired(next);
              if (next) void loadVehicles({ includeRetired: true });
              else setStatusFilter('all');
            }}
            size="sm"
            variant={showRetired ? 'primary' : 'secondary'}>
            Mostrar retiradas
          </PortalButton>
        </View>
      </PortalSectionCard>

      <PortalUnitsList
        canManageUnits={canManageUnits}
        onContinueToRoutes={() => router.push('/portal/rutas' as never)}
        onDelete={(vehicle) => void prepareVehicleLifecycle(vehicle)}
        onEdit={startEdit}
        operationalUnits={operationalUnits}
        vehicles={sortedVehicles}
      />

      <ConfirmModal
        visible={Boolean(canManageUnits && deleteTarget)}
        destructive
        title={`Preparar unidad ${deleteTarget?.code || ''} para retiro`}
        description={lifecycleImpact?.mustRetire
          ? 'Esta unidad conserva historial y se retirara sin borrar su evidencia.'
          : 'Revisa las dependencias antes de eliminar o retirar la unidad.'}
        confirmLabel={lifecycleImpact?.canDeletePermanently ? 'Eliminar sin historial' : 'Retirar unidad'}
        confirmDisabled={lifecycleConfirmDisabled}
        processing={isSubmitting}
        onCancel={() => {
          setDeleteTarget(null);
          setLifecycleImpact(null);
          setMessage(null);
        }}
        onConfirm={async () => {
          if (!deleteTarget || !canManageUnits || lifecycleConfirmDisabled || !lifecycleImpact) return;
          const result = lifecycleImpact.canDeletePermanently
            ? await deleteVehicle(deleteTarget.id)
            : await retireVehicle(deleteTarget.id, retirementReason);
          setMessage(result.ok
            ? lifecycleImpact.canDeletePermanently ? 'Unidad eliminada sin historial.' : 'Unidad retirada; su historial permanece disponible.'
            : result.message || 'No fue posible completar el retiro.');
          if (result.ok) setDeleteTarget(null);
        }}>
        {lifecycleImpact ? <View style={styles.checklist}>
          <Text style={[styles.unitMeta, { color: lifecycleImpact.activeRouteSession ? palette.danger : palette.success }]}>
            {lifecycleImpact.activeRouteSession ? '!' : '✓'} Jornada finalizada
          </Text>
          <Text style={[styles.unitMeta, { color: lifecycleImpact.driver ? palette.danger : palette.success }]}>
            {lifecycleImpact.driver ? '!' : '✓'} Conductor liberado
          </Text>
          <Text style={[styles.unitMeta, { color: hasAssignedRoute ? palette.muted : palette.success }]}>
            {hasAssignedRoute ? '↻ Ruta se liberará automáticamente al retirar' : '✓ Ruta desasignada'}
          </Text>
          <Text style={[styles.unitMeta, { color: palette.muted }]}>✓ Documentos identificados: {lifecycleImpact.documents.count}</Text>
          <Text style={[styles.unitMeta, { color: palette.muted }]}>✓ Registros historicos: {lifecycleImpact.history.total}</Text>
          {lifecycleImpact.actionsRequired.length ? <View style={styles.filterBar}>
            {lifecycleImpact.driver ? <PortalButton onPress={() => router.push('/portal/usuarios' as never)} size="sm" variant="secondary">Liberar conductor</PortalButton> : null}
            {lifecycleImpact.activeRouteSession ? <PortalButton onPress={() => router.push('/portal' as never)} size="sm" variant="secondary">Abrir jornada</PortalButton> : null}
          </View> : null}
          {!lifecycleImpact.canDeletePermanently ? (
            <TextInput
              accessibilityLabel="Motivo de retiro"
              placeholder="Motivo de retiro"
              placeholderTextColor={palette.muted}
              value={retirementReason}
              onChangeText={setRetirementReason}
              style={[styles.input, { borderColor: palette.line, color: palette.text, backgroundColor: palette.surface }]}
            />
          ) : null}
        </View> : <Text style={[styles.unitMeta, { color: palette.muted }]}>Cargando impacto...</Text>}
      </ConfirmModal>
    </PortalLayout>
  );
}
