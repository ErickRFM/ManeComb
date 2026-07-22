import { router } from '@/src/navigation/router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { palette } from '@/constants/theme';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { PortalLayout } from '../components/portal-layout';
import { portalButtonGradient } from '../portal-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type { Role, User, UserAccountStatus } from '@/src/types/app';
import { PortalUsersContextNotice } from '../users/components/portal-users-context-notice';
import { PortalDriverAssignments } from '../users/components/portal-driver-assignments';
import { PortalAdministrativeUsers } from '../users/components/portal-administrative-users';
import { PortalUserStatusSelector } from '../users/components/portal-user-status-selector';
import { styles } from '../users/users.styles';

const statusLabels: Record<string, string> = {
  active: 'Activo',
  pending: 'Pendiente',
  suspended: 'Suspendido',
};

export function PortalUsersScreen() {
  const { deleteUser, isSubmitting, loadUsers, loadVehicles, updateUser, user, users, vehicles } = useAppStore(
    useShallow((state) => ({
      deleteUser: state.deleteUser,
      isSubmitting: state.isSubmitting,
      loadUsers: state.loadUsers,
      loadVehicles: state.loadVehicles,
      updateUser: state.updateUser,
      user: state.user,
      users: state.users,
      vehicles: state.vehicles,
    }))
  );
  const canManageUsers = Boolean(user && ['owner', 'admin'].includes(user.role));
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
    () => vehicles.filter((vehicle) => vehicle.status !== 'maintenance'),
    [vehicles]
  );

  const assignVehicleToDriver = async (driverId: string, vehicleId: string | null) => {
    setMessage(null);
    const result = await updateUser(driverId, { vehicleId });
    if (!result.ok) {
      setMessage(result.message || 'No fue posible actualizar la asignacion.');
      return;
    }
    setMessage(vehicleId ? 'Unidad asignada.' : 'Unidad liberada.');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteUser(deleteTarget.id);
    setMessage(result.ok ? 'Usuario eliminado.' : result.message || 'No fue posible eliminar el usuario.');
    if (result.ok) setDeleteTarget(null);
  };

  const confirmEdit = async () => {
    if (!editTarget) return;
    const result = await updateUser(editTarget.id, { userStatus: editStatus, status: editStatus === 'suspended' ? 'offline' : 'online' });
    setMessage(result.ok ? 'Estado actualizado.' : result.message || 'No fue posible actualizar.');
    if (result.ok) setEditTarget(null);
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
          availableVehicles={availableVehicles}
          drivers={driverUsers}
          isSubmitting={isSubmitting}
          onAssign={(driverId, vehicleId) => void assignVehicleToDriver(driverId, vehicleId)}
          vehicles={vehicles}
        />
      ) : null}

      <PortalAdministrativeUsers
        canManageUsers={canManageUsers}
        onDelete={setDeleteTarget}
        onEdit={(item) => {
          setEditTarget(item);
          setEditStatus(item.userStatus || 'active');
        }}
        users={administrativeUsers}
      />

      <ConfirmModal
        visible={Boolean(deleteTarget)}
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
        processing={isSubmitting}
        onCancel={() => { setDeleteTarget(null); setMessage(null); }}
        onConfirm={confirmDelete}
      />

      <ConfirmModal
        visible={Boolean(editTarget)}
        title="Cambiar estado"
        description={`Actualiza el estado de ${editTarget?.name || 'este usuario'}.`}
        confirmLabel="Guardar"
        processing={isSubmitting}
        onCancel={() => setEditTarget(null)}
        onConfirm={confirmEdit}>
        <PortalUserStatusSelector onChange={setEditStatus} value={editStatus} />
      </ConfirmModal>
    </PortalLayout>
  );
}
