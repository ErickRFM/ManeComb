import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { PortalSectionCard, formatPortalStatus, getPortalStatusTone } from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { portalButtonGradient } from '../portal-theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type { Role, User, UserAccountStatus } from '@/src/types/app';
import { formatDate, formatRole } from '@/src/utils/format';

const statusLabels: Record<string, string> = {
  active: 'Activo',
  pending: 'Pendiente',
  suspended: 'Suspendido',
};

export function PortalUsersScreen() {
  const { theme } = useAppTheme();
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
        <View style={[styles.contextNotice, { backgroundColor: theme.colors.infoSoft, borderColor: theme.colors.line }]}>
          <View style={[styles.contextIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
            <MaterialCommunityIcons name="key-variant" size={20} color={theme.colors.info} />
          </View>
          <View style={styles.contextCopy}>
            <Text style={[styles.contextTitle, { color: theme.colors.text }]}>Invitar usuarios mediante keys</Text>
            <Text style={[styles.contextText, { color: theme.colors.muted }]}>
              Genera keys de activación para conductores y usuarios de gestión. Cada key define rol y permisos. El usuario completa su registro y aparece automáticamente en el equipo.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/portal/onboarding' as never)}
            style={[styles.primaryButton, portalButtonGradient()]}>
            <MaterialCommunityIcons name="key-plus" size={18} color="#FFFFFF" />
            <Text style={styles.primaryText}>Ir a activación</Text>
          </Pressable>
        </View>
      ) : null}

      {message ? (
        <View style={[styles.messageBar, { backgroundColor: theme.colors.infoSoft, borderColor: theme.colors.line }]}>
          <Text style={[styles.messageText, { color: theme.colors.text }]}>{message}</Text>
        </View>
      ) : null}

      {canManageUsers ? (
        <PortalSectionCard title="Asignacion de unidades" subtitle={`${driverUsers.length} conductores activados`}>
          {driverUsers.length ? (
            <View style={styles.list}>
              {driverUsers.map((driver) => {
                const driverVehicleOptions = availableVehicles.filter(
                  (vehicle) => !vehicle.driverId || vehicle.driverId === driver.id || vehicle.id === driver.vehicleId
                );
                const assignedVehicle = vehicles.find((vehicle) => vehicle.id === driver.vehicleId);

                return (
                  <View key={driver.id} style={[styles.assignmentRow, { borderColor: theme.colors.line, backgroundColor: theme.colors.surface }]}>
                    <View style={styles.userBody}>
                      <Text style={[styles.userName, { color: theme.colors.text }]}>{driver.name}</Text>
                      <Text style={[styles.userMeta, { color: theme.colors.muted }]}>
                        {driver.email} / Unidad: {assignedVehicle?.code || 'Sin unidad'}
                      </Text>
                    </View>
                    <View style={styles.assignmentOptions}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void assignVehicleToDriver(driver.id, null)}
                        disabled={isSubmitting}
                        style={[
                          styles.assignmentChip,
                          {
                            backgroundColor: !driver.vehicleId ? theme.colors.infoSoft : theme.colors.surfaceAlt,
                            borderColor: !driver.vehicleId ? theme.colors.info : theme.colors.line,
                          },
                        ]}>
                        <Text style={[styles.assignmentText, { color: !driver.vehicleId ? theme.colors.info : theme.colors.text }]}>
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
                              backgroundColor: driver.vehicleId === vehicle.id ? theme.colors.successSoft : theme.colors.surfaceAlt,
                              borderColor: driver.vehicleId === vehicle.id ? theme.colors.success : theme.colors.line,
                            },
                          ]}>
                          <Text
                            style={[
                              styles.assignmentText,
                              { color: driver.vehicleId === vehicle.id ? theme.colors.success : theme.colors.text },
                            ]}>
                            {vehicle.code}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
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
          <View style={styles.list}>
            {administrativeUsers.map((item) => (
              <View key={item.id} style={[styles.userRow, { borderColor: theme.colors.line, backgroundColor: theme.colors.surface }]}>
                <View style={[styles.avatar, { backgroundColor: theme.colors.accentSoft }]}>
                  <Text style={[styles.avatarText, { color: theme.colors.accent }]}>{item.avatar && !item.avatar.startsWith('http') ? item.avatar : item.name.slice(0, 2)}</Text>
                </View>
                <View style={styles.userBody}>
                  <Text style={[styles.userName, { color: theme.colors.text }]}>{item.name}</Text>
                  <Text style={[styles.userMeta, { color: theme.colors.muted }]}>
                    {item.email} / {item.accountType === 'company_owner' && item.role === 'owner' ? 'Owner' : formatRole(item.role)} / Ultimo acceso: {formatDate(item.lastAccessAt, { fallback: 'Sin acceso' })}
                  </Text>
                </View>
                <StatusBadge label={formatPortalStatus(item.userStatus || 'active')} tone={getPortalStatusTone(item.userStatus)} />
                <View style={styles.rowActions}>
                  {canManageUsers && item.role !== 'owner' ? (
                    <>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${item.name}`} onPress={() => { setEditTarget(item); setEditStatus(item.userStatus || 'active'); }} style={[styles.iconAction, { backgroundColor: theme.colors.infoSoft }]}>
                        <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.colors.info} />
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Eliminar ${item.name}`} onPress={() => setDeleteTarget(item)} style={[styles.iconAction, { backgroundColor: theme.colors.dangerSoft }]}>
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.colors.danger} />
                      </Pressable>
                    </>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="account-group-outline"
            title="Sin usuarios de gestión"
            description="Usa las keys de activación para invitar usuarios de gestión al equipo."
          />
        )}
      </PortalSectionCard>

      <ConfirmModal
        visible={Boolean(deleteTarget)}
        destructive
        title="Eliminar usuario"
        description={`Se eliminara ${deleteTarget?.name || 'este usuario'} de la cuenta.`}
        confirmLabel="Eliminar"
        processing={isSubmitting}
        onCancel={() => setDeleteTarget(null)}
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
                { borderColor: editStatus === status ? theme.colors.info : theme.colors.line },
                editStatus === status ? { backgroundColor: theme.colors.infoSoft } : { backgroundColor: theme.colors.surface },
              ]}>
              <Text style={[
                styles.statusOptionText,
                { color: editStatus === status ? theme.colors.info : theme.colors.text },
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
