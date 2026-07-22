import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, palette, Typography } from '@/constants/theme';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { PortalSectionCard, formatPortalStatus, getPortalStatusTone } from '../cards';
import { PortalLayout } from '../components/portal-layout';
import { PortalButton } from '../components/portal-button';
import { PortalDataList, PortalDataRow } from '../components/portal-data-list';
import { portalButtonGradient } from '../portal-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type { Role, User, UserAccountStatus } from '@/src/types/app';
import { formatDate, formatRole } from '@/src/utils/format';

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
        <View style={[styles.contextNotice, { backgroundColor: palette.infoSoft, borderColor: palette.line }]}>
          <View style={[styles.contextIcon, { backgroundColor: palette.surfaceAlt }]}>
            <MaterialCommunityIcons name="key-variant" size={20} color={palette.info} />
          </View>
          <View style={styles.contextCopy}>
            <Text style={[styles.contextTitle, { color: palette.text }]}>Incorporar conductores mediante keys</Text>
            <Text style={[styles.contextText, { color: palette.muted }]}>
              Los conductores se registran exclusivamente con una key de activación. Genérala en Activación; cuando el chofer complete el registro, aparecerá automáticamente en el equipo.
            </Text>
          </View>
          <PortalButton icon="key-plus" onPress={() => router.push('/portal/onboarding' as never)}>Ir a activación</PortalButton>
        </View>
      ) : null}

      {message ? (
        <View style={[styles.messageBar, { backgroundColor: palette.infoSoft, borderColor: palette.line }]}>
          <Text style={[styles.messageText, { color: palette.text }]}>{message}</Text>
        </View>
      ) : null}

      {canManageUsers ? (
        <PortalSectionCard title="Asignacion de unidades" subtitle={`${driverUsers.length} conductores activados`}>
          {driverUsers.length ? (
            <PortalDataList>
              {driverUsers.map((driver) => {
                const driverVehicleOptions = availableVehicles.filter(
                  (vehicle) => !vehicle.driverId || vehicle.driverId === driver.id || vehicle.id === driver.vehicleId
                );
                const assignedVehicle = vehicles.find((vehicle) => vehicle.id === driver.vehicleId);

                return (
                  <PortalDataRow key={driver.id} body={<>
                      <Text style={[styles.userName, { color: palette.text }]}>{driver.name}</Text>
                      <Text style={[styles.userMeta, { color: palette.muted }]}>
                        {driver.email} / Unidad: {assignedVehicle?.code || 'Sin unidad'}
                      </Text>
                    </>} actions={<View style={styles.assignmentOptions}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void assignVehicleToDriver(driver.id, null)}
                        disabled={isSubmitting}
                        style={[
                          styles.assignmentChip,
                          {
                            backgroundColor: !driver.vehicleId ? palette.infoSoft : palette.surfaceAlt,
                            borderColor: !driver.vehicleId ? palette.info : palette.line,
                          },
                        ]}>
                        <Text style={[styles.assignmentText, { color: !driver.vehicleId ? palette.info : palette.text }]}>
                          Sin unidad
                        </Text>
                      </Pressable>
                      {driverVehicleOptions.map((vehicle) => (
                        <Pressable
                          key={vehicle.id}
                          accessibilityRole="button"
                          onPress={() => void assignVehicleToDriver(driver.id, vehicle.id)}
                          disabled={isSubmitting}
                          style={[
                            styles.assignmentChip,
                            {
                              backgroundColor: driver.vehicleId === vehicle.id ? palette.successSoft : palette.surfaceAlt,
                              borderColor: driver.vehicleId === vehicle.id ? palette.success : palette.line,
                            },
                          ]}>
                          <Text
                            style={[
                              styles.assignmentText,
                              { color: driver.vehicleId === vehicle.id ? palette.success : palette.text },
                            ]}>
                            {vehicle.code}
                          </Text>
                        </Pressable>
                      ))}
                    </View>} />
                );
              })}
            </PortalDataList>
          ) : (
            <EmptyState
              icon="account-hard-hat-outline"
              title="Sin conductores activados"
              description="Genera una key de activacion para que el conductor cree su cuenta antes de asignarle unidad."
            />
          )}
        </PortalSectionCard>
      ) : null}

      <PortalSectionCard
        title="Usuarios de gestión"
        subtitle={`${administrativeUsers.length} ${administrativeUsers.length === 1 ? 'usuario de gestión' : 'usuarios de gestión'}`}>
        {administrativeUsers.length ? (
          <PortalDataList>
            {administrativeUsers.map((item) => (
              <PortalDataRow key={item.id} leading={<View style={[styles.avatar, { backgroundColor: palette.accentSoft }]}>
                  <Text style={[styles.avatarText, { color: palette.accent }]}>{item.avatar && !item.avatar.startsWith('http') ? item.avatar : item.name.slice(0, 2)}</Text>
                </View>} body={<>
                  <Text style={[styles.userName, { color: palette.text }]}>{item.name}</Text>
                  <Text style={[styles.userMeta, { color: palette.muted }]}>
                    {item.email} / {item.accountType === 'company_owner' && item.role === 'owner' ? 'Owner' : formatRole(item.role)} / Ultimo acceso: {formatDate(item.lastAccessAt, { fallback: 'Sin acceso' })}
                  </Text>
                </>} meta={<StatusBadge label={formatPortalStatus(item.userStatus || 'active')} tone={getPortalStatusTone(item.userStatus)} />} actions={<View style={styles.rowActions}>
                  {canManageUsers && item.role !== 'owner' ? (
                    <>
                      <PortalButton accessibilityLabel={`Editar ${item.name}`} icon="pencil-outline" onPress={() => { setEditTarget(item); setEditStatus(item.userStatus || 'active'); }} size="sm" variant="icon" />
                      <PortalButton accessibilityLabel={`Eliminar ${item.name}`} icon="trash-can-outline" onPress={() => setDeleteTarget(item)} size="sm" variant="danger" />
                    </>
                  ) : null}
                </View>} />
            ))}
          </PortalDataList>
        ) : (
          <EmptyState
            icon="account-group-outline"
            title="Sin usuarios de gestión"
            description="No hay usuarios de gestión adicionales registrados en esta cuenta."
          />
        )}
      </PortalSectionCard>

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
        <View style={styles.statusSelector}>
          {(['active', 'suspended', 'pending'] as const).map((status) => (
            <Pressable
              key={status}
              accessibilityRole="button"
              onPress={() => setEditStatus(status)}
              style={[
                styles.statusOption,
                { borderColor: editStatus === status ? palette.info : palette.line },
                editStatus === status ? { backgroundColor: palette.infoSoft } : { backgroundColor: palette.surface },
              ]}>
              <Text style={[
                styles.statusOptionText,
                { color: editStatus === status ? palette.info : palette.text },
              ]}>
                {status === 'active' ? 'Activo' : status === 'suspended' ? 'Suspendido' : 'Pendiente'}
              </Text>
            </Pressable>
          ))}
        </View>
      </ConfirmModal>
    </PortalLayout>
  );
}

const styles = StyleSheet.create({
  contextNotice: {
    alignItems: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: AppTheme.spacing.md,
  },
  contextIcon: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    flexShrink: 0,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  contextCopy: {
    flex: 1,
    flexBasis: 260,
    minWidth: 0,
  },
  contextTitle: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  contextText: {
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  messageBar: {
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    padding: 10,
  },
  messageText: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
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
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
    flexShrink: 1,
  },
  list: {
    gap: 10,
    minWidth: 0,
  },
  userRow: {
    alignItems: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    minWidth: 0,
    padding: 12,
  },
  assignmentRow: {
    alignItems: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    minWidth: 0,
    padding: 12,
  },
  assignmentOptions: {
    flexDirection: 'row',
    flexBasis: 280,
    flexGrow: 1,
    flexShrink: 1,
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  assignmentChip: {
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexShrink: 1,
    minHeight: 36,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  assignmentText: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  avatar: {
    alignItems: 'center',
    borderRadius: 18,
    flexShrink: 0,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  avatarText: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  userBody: {
    flex: 1,
    flexBasis: 260,
    minWidth: 0,
  },
  userName: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
    minWidth: 0,
  },
  userMeta: {
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
    minWidth: 0,
  },
  rowActions: {
    flexDirection: 'row',
    flexShrink: 0,
    flexWrap: 'wrap',
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
  statusSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
    paddingVertical: 8,
  },
  statusOption: {
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  statusOptionText: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
});
