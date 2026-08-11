import { router } from '@/src/navigation/router';
import { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { palette } from '@/constants/theme';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { PortalLayout } from '../components/portal-layout';
import { useAppStore } from '@/src/store/use-app-store';
import { getDriverLifecycleImpactRequest } from '@/src/api/client';
import type { DriverLifecycleImpact, User, UserAccountStatus } from '@/src/types/app';
import { PortalUsersContextNotice } from '../users/components/portal-users-context-notice';
import { PortalDriverAssignments } from '../users/components/portal-driver-assignments';
import { PortalAdministrativeUsers } from '../users/components/portal-administrative-users';
import { PortalButton } from '../components/portal-button';
import { PortalUserStatusSelector } from '../users/components/portal-user-status-selector';
import { hasPortalPermission } from '../utils/access';
import { styles } from '../users/users.styles';

type DriverAction = 'assign' | 'offboard' | 'reactivate' | 'delete';

export function PortalUsersScreen() {
  const { deleteDriver, deleteUser, isSubmitting, loadUsers, loadVehicles, offboardDriver, reactivateDriver, updateUser, user, users, vehicles } = useAppStore(
    useShallow((state) => ({
      deleteUser: state.deleteUser,
      deleteDriver: state.deleteDriver,
      isSubmitting: state.isSubmitting,
      loadUsers: state.loadUsers,
      loadVehicles: state.loadVehicles,
      offboardDriver: state.offboardDriver,
      reactivateDriver: state.reactivateDriver,
      updateUser: state.updateUser,
      user: state.user,
      users: state.users,
      vehicles: state.vehicles,
    }))
  );
  const canManageUsers = hasPortalPermission(user, 'users');
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [driverTarget, setDriverTarget] = useState<User | null>(null);
  const [driverAction, setDriverAction] = useState<DriverAction>('assign');
  const [driverImpact, setDriverImpact] = useState<DriverLifecycleImpact | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [reason, setReason] = useState('Baja laboral');
  const [confirmation, setConfirmation] = useState('');
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editStatus, setEditStatus] = useState<UserAccountStatus>('active');

  useEffect(() => {
    void loadUsers();
    void loadVehicles();
  }, [loadUsers, loadVehicles]);

  const administrativeUsers = useMemo(
    () => users.filter((entry) => entry.role !== 'driver' && (entry.accountType === 'company_owner' || ['owner', 'admin', 'supervisor', 'billing_manager', 'support', 'viewer'].includes(entry.role))),
    [users]
  );
  const driverUsers = useMemo(
    () => users.filter((entry) => entry.role === 'driver'),
    [users]
  );
  const availableVehicles = useMemo(
    () => vehicles.filter((vehicle) =>
      !vehicle.retiredAt &&
      (
        vehicle.id === driverTarget?.vehicleId ||
        (vehicle.status === 'available' && !vehicle.driverId)
      )
    ),
    [driverTarget?.vehicleId, vehicles]
  );
  const driverReasonValid = reason.trim().length >= 3;
  const driverConfirmDisabled = !driverTarget || (
    driverAction === 'assign'
      ? selectedVehicleId === (driverTarget.vehicleId || null)
      : driverAction === 'offboard'
        ? !driverImpact?.canOffboard || !driverReasonValid
        : driverAction === 'delete'
          ? !driverImpact?.canDelete || !driverReasonValid || confirmation.trim().toUpperCase() !== 'ELIMINAR'
          : false
  );

  const confirmDelete = async () => {
    if (!deleteTarget || deleteTarget.role === 'owner' || !canManageUsers) return;
    const result = await deleteUser(deleteTarget.id);
    setMessage(result.ok ? 'Usuario eliminado.' : result.message || 'No fue posible eliminar el usuario.');
    if (result.ok) setDeleteTarget(null);
  };

  const confirmEdit = async () => {
    if (!editTarget || !canManageUsers) return;
    const result = await updateUser(editTarget.id, { userStatus: editStatus, status: editStatus === 'suspended' ? 'offline' : 'online' });
    setMessage(result.ok ? 'Estado actualizado.' : result.message || 'No fue posible actualizar.');
    if (result.ok) setEditTarget(null);
  };

  const openDriverManager = async (driver: User) => {
    if (!canManageUsers) return;
    setDriverTarget(driver);
    setDriverAction(driver.userStatus === 'suspended' ? 'reactivate' : 'assign');
    setSelectedVehicleId(driver.vehicleId || null);
    setReason('Baja laboral');
    setConfirmation('');
    setDriverImpact(null);
    try {
      setDriverImpact(await getDriverLifecycleImpactRequest(driver.id));
    } catch {
      setMessage('No fue posible cargar el impacto del conductor.');
    }
  };

  const confirmDriverAction = async () => {
    if (!driverTarget || !canManageUsers || driverConfirmDisabled) return;
    const currentVehicle = vehicles.find((entry) => entry.id === driverTarget.vehicleId);
    let result;
    if (driverAction === 'assign') result = await updateUser(driverTarget.id, { vehicleId: selectedVehicleId });
    else if (driverAction === 'offboard') result = await offboardDriver(driverTarget.id, reason);
    else if (driverAction === 'reactivate') result = await reactivateDriver(driverTarget.id);
    else result = await deleteDriver(driverTarget.id, reason, confirmation);

    if (!result.ok) {
      setMessage(result.message || 'No fue posible completar la accion.');
      return;
    }
    const success = driverAction === 'assign'
      ? selectedVehicleId
        ? 'Unidad asignada al conductor.'
        : `${currentVehicle?.code || 'La unidad'} disponible nuevamente. El conductor continua activo sin unidad.`
      : driverAction === 'offboard'
        ? result.message || 'Conductor dado de baja. Cupo disponible para una nueva key.'
        : driverAction === 'reactivate'
          ? 'Conductor reactivado sin unidad. Selecciona una unidad disponible.'
          : 'Conductor eliminado conservando su evidencia historica.';
    setMessage(success);
    setDriverTarget(null);
  };

  return (
    <PortalLayout title="Equipo" subtitle="Administradores, supervisores, responsables de facturación, soporte y conductores.">
      {canManageUsers ? (
        <PortalUsersContextNotice onOpenActivation={() => router.push('/portal/onboarding' as never)} />
      ) : null}

      {message ? (
        <View style={[styles.messageBar, { backgroundColor: palette.infoSoft, borderColor: palette.line }]}>
          <Text style={[styles.messageText, { color: palette.text }]}>{message}</Text>
        </View>
      ) : null}

      {canManageUsers ? (
        <PortalDriverAssignments
          drivers={driverUsers}
          isSubmitting={isSubmitting}
          onManage={(driver) => void openDriverManager(driver)}
          vehicles={vehicles}
        />
      ) : null}

      <PortalAdministrativeUsers
        canManageUsers={canManageUsers}
        onDelete={setDeleteTarget}
        onEdit={(item) => {
          if (!canManageUsers) return;
          setEditTarget(item);
          setEditStatus(item.userStatus || 'active');
        }}
        users={administrativeUsers}
      />

      <ConfirmModal
        visible={Boolean(canManageUsers && deleteTarget)}
        destructive
        title={
          deleteTarget?.role === 'driver'
            ? `Eliminar conductor "${deleteTarget.name}"`
            : `Eliminar usuario "${deleteTarget?.name || ''}"`
        }
        description={
          deleteTarget?.role === 'owner'
            ? 'No se puede eliminar al propietario de la organización.'
            : `Esta acción eliminará a ${deleteTarget?.name || 'este usuario'} de la cuenta.`
        }
        confirmLabel="Eliminar"
        confirmDisabled={deleteTarget?.role === 'owner'}
        processing={isSubmitting}
        onCancel={() => { setDeleteTarget(null); setMessage(null); }}
        onConfirm={confirmDelete}
      />

      <ConfirmModal
        visible={Boolean(canManageUsers && editTarget)}
        title="Cambiar estado"
        description={`Actualiza el estado de ${editTarget?.name || 'este usuario'}.`}
        confirmLabel="Guardar"
        processing={isSubmitting}
        onCancel={() => setEditTarget(null)}
        onConfirm={confirmEdit}>
        <PortalUserStatusSelector onChange={setEditStatus} value={editStatus} />
      </ConfirmModal>

      <ConfirmModal
        visible={Boolean(canManageUsers && driverTarget)}
        destructive={driverAction === 'offboard' || driverAction === 'delete'}
        title={`Administrar a ${driverTarget?.name || 'conductor'}`}
        description={driverImpact?.blockers.length
          ? driverImpact.blockers.join(' ')
          : `Unidad actual: ${driverImpact?.assignedVehicle?.code || 'Sin unidad'}. Sesiones a revocar: ${driverImpact?.sessionsToRevoke || 0}.`}
        confirmLabel={driverAction === 'assign' ? 'Confirmar asignacion' : driverAction === 'offboard' ? 'Dar de baja' : driverAction === 'reactivate' ? 'Reactivar' : 'Eliminar definitivamente'}
        confirmDisabled={driverConfirmDisabled}
        processing={isSubmitting}
        onCancel={() => setDriverTarget(null)}
        onConfirm={() => void confirmDriverAction()}>
        <View style={styles.lifecycleActions}>
          {driverTarget?.userStatus !== 'suspended' ? <>
            <PortalButton onPress={() => setDriverAction('assign')} size="sm" variant={driverAction === 'assign' ? 'primary' : 'secondary'}>Unidad</PortalButton>
            <PortalButton onPress={() => setDriverAction('offboard')} size="sm" variant={driverAction === 'offboard' ? 'danger' : 'secondary'}>Dar de baja</PortalButton>
          </> : <>
            <PortalButton onPress={() => setDriverAction('reactivate')} size="sm" variant={driverAction === 'reactivate' ? 'primary' : 'secondary'}>Reactivar</PortalButton>
            <PortalButton onPress={() => setDriverAction('delete')} size="sm" variant={driverAction === 'delete' ? 'danger' : 'secondary'}>Eliminar</PortalButton>
          </>}
        </View>
        {driverAction === 'assign' ? (
          <View style={styles.lifecycleActions}>
            <PortalButton onPress={() => setSelectedVehicleId(null)} size="sm" variant={selectedVehicleId === null ? 'primary' : 'secondary'}>Sin unidad</PortalButton>
            {availableVehicles.map((vehicle) => (
              <PortalButton key={vehicle.id} onPress={() => setSelectedVehicleId(vehicle.id)} size="sm" variant={selectedVehicleId === vehicle.id ? 'primary' : 'secondary'}>
                {vehicle.code} / {vehicle.plate}{vehicle.id === driverTarget?.vehicleId ? ' · actual' : ''}
              </PortalButton>
            ))}
          </View>
        ) : driverAction === 'offboard' || driverAction === 'delete' ? <>
          <TextInput
            accessibilityLabel="Motivo"
            placeholder="Motivo"
            placeholderTextColor={palette.muted}
            value={reason}
            onChangeText={setReason}
            style={[styles.lifecycleInput, { borderColor: palette.line, color: palette.text }]}
          />
          {driverAction === 'delete' ? (
            <TextInput
              accessibilityLabel="Escribe ELIMINAR para confirmar"
              autoCapitalize="characters"
              placeholder="Escribe ELIMINAR"
              placeholderTextColor={palette.muted}
              value={confirmation}
              onChangeText={setConfirmation}
              style={[styles.lifecycleInput, { borderColor: palette.line, color: palette.text }]}
            />
          ) : null}
        </> : null}
        {driverImpact?.warnings.length ? (
          <View style={[styles.lifecycleInfo, { borderColor: palette.line, backgroundColor: palette.surfaceAlt }]}>
            {driverImpact.warnings.map((warning) => <Text key={warning} style={[styles.userMeta, { color: palette.muted }]}>{warning}</Text>)}
          </View>
        ) : null}
      </ConfirmModal>
    </PortalLayout>
  );
}
