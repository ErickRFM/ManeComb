import { router } from '@/src/navigation/router';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { useAppStore } from '@/src/store/use-app-store';
import type { Vehicle, VehicleMutationPayload, VehicleStatus } from '@/src/types/app';
import { PortalLayout } from '../components/portal-layout';
import { portalButtonGradient } from '../portal-theme';
import { PortalUnitForm } from '../units/components/portal-unit-form';
import { PortalUnitsContinuityBanner } from '../units/components/portal-units-continuity-banner';
import { PortalUnitsList } from '../units/components/portal-units-list';
import type { UnitEditor } from '../units/units.types';
import { createBlankEditor } from '../units/units.utils';

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

      <PortalUnitsList
        canManageUnits={canManageUnits}
        onContinueToRoutes={() => router.push('/portal/rutas' as never)}
        onDelete={setDeleteTarget}
        onEdit={startEdit}
        vehicles={sortedVehicles}
      />

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
