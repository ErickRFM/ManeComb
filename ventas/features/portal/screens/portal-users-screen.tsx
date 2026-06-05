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
import { formatRole } from '@/src/utils/format';
import { usePortalStore } from '../store/use-portal-store';
import { canOpenOperationalPanel } from '../utils/access';

type UserEditor = {
  name: string;
  email: string;
  password: string;
  role: Role;
  phone: string;
  userStatus: UserAccountStatus;
};

const administrativeRoles: Role[] = ['owner', 'admin', 'billing_manager', 'support', 'viewer'];
const editableRoles: Role[] = ['admin', 'billing_manager', 'support', 'viewer'];
const statuses: UserAccountStatus[] = ['active', 'pending', 'suspended'];

function createBlankEditor(): UserEditor {
  return {
    name: '',
    email: '',
    password: '',
    role: 'billing_manager',
    phone: '',
    userStatus: 'pending',
  };
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Sin acceso';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Sin acceso'
    : date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PortalUsersScreen() {
  const { theme } = useAppTheme();
  const { createUser, deleteUser, isSubmitting, loadUsers, updateUser, user, users } = useAppStore(
    useShallow((state) => ({
      createUser: state.createUser,
      deleteUser: state.deleteUser,
      isSubmitting: state.isSubmitting,
      loadUsers: state.loadUsers,
      updateUser: state.updateUser,
      user: state.user,
      users: state.users,
    }))
  );
  const subscription = usePortalStore((state) => state.subscription);
  const canManageUsers = Boolean(user && ['owner', 'admin'].includes(user.role));
  const showOperationalPanel = canOpenOperationalPanel(subscription, user);
  const [editor, setEditor] = useState<UserEditor>(createBlankEditor);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const administrativeUsers = useMemo(
    () => users.filter((entry) => entry.accountType === 'company_owner' || administrativeRoles.includes(entry.role)),
    [users]
  );
  const operationalUsersCount = useMemo(
    () => users.filter((entry) => !administrativeRoles.includes(entry.role) && entry.accountType !== 'company_owner').length,
    [users]
  );

  const setField = <T extends keyof UserEditor>(field: T, value: UserEditor[T]) => {
    setEditor((current) => ({ ...current, [field]: value }));
  };

  const resetEditor = () => {
    setEditingId(null);
    setEditor(createBlankEditor());
  };

  const startEdit = (user: User) => {
    setEditingId(user.id);
    setEditor({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      phone: user.phone,
      userStatus: user.userStatus || 'active',
    });
  };

  const saveUser = async () => {
    setMessage(null);
    if (!editor.name.trim() || !editor.email.trim()) {
      setMessage('Nombre y correo son obligatorios.');
      return;
    }

    if (!editingId && !editor.password.trim()) {
      setMessage('La contrasena es obligatoria para invitar un usuario.');
      return;
    }

    const payload = {
      accountType: 'company_owner' as const,
      name: editor.name.trim(),
      email: editor.email.trim(),
      password: editor.password.trim() || undefined,
      role: editor.role,
      phone: editor.phone.trim(),
      userStatus: editor.userStatus,
      status: editor.userStatus === 'suspended' ? 'offline' : 'online',
    };
    const result = editingId ? await updateUser(editingId, payload) : await createUser(payload);

    if (!result.ok) {
      setMessage(result.message || 'No fue posible guardar el usuario.');
      return;
    }

    resetEditor();
    setMessage(editingId ? 'Usuario actualizado.' : 'Usuario invitado.');
  };

  return (
    <PortalLayout title="Equipo administrativo" subtitle="Owners, administradores, facturacion y soporte de la cuenta SaaS.">
      {canManageUsers ? <PortalSectionCard
        title={editingId ? 'Editar usuario administrativo' : 'Invitar usuario administrativo'}
        subtitle={message || 'Los usuarios operativos viven en el panel operativo.'}>
        <View style={styles.formGrid}>
          <TextInput
            value={editor.name}
            onChangeText={(value) => setField('name', value)}
            placeholder="Nombre"
            placeholderTextColor={theme.colors.muted}
            style={[styles.input, { borderColor: theme.colors.lineStrong, color: theme.colors.text }]}
          />
          <TextInput
            value={editor.email}
            onChangeText={(value) => setField('email', value)}
            placeholder="Correo"
            placeholderTextColor={theme.colors.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            style={[styles.input, { borderColor: theme.colors.lineStrong, color: theme.colors.text }]}
          />
          <TextInput
            value={editor.password}
            onChangeText={(value) => setField('password', value)}
            placeholder={editingId ? 'Nueva contrasena opcional' : 'Contrasena temporal'}
            placeholderTextColor={theme.colors.muted}
            secureTextEntry
            style={[styles.input, { borderColor: theme.colors.lineStrong, color: theme.colors.text }]}
          />
          <TextInput
            value={editor.phone}
            onChangeText={(value) => setField('phone', value)}
            placeholder="Telefono"
            placeholderTextColor={theme.colors.muted}
            style={[styles.input, { borderColor: theme.colors.lineStrong, color: theme.colors.text }]}
          />
        </View>
        <View style={styles.segmentRow}>
          {editableRoles.map((role) => (
            <Pressable
              key={role}
              onPress={() => setField('role', role)}
              style={[
                styles.segment,
                {
                  backgroundColor: editor.role === role ? theme.colors.accentSoft : theme.colors.surfaceAlt,
                  borderColor: editor.role === role ? theme.colors.accent : theme.colors.line,
                },
              ]}>
              <Text style={[styles.segmentText, { color: editor.role === role ? theme.colors.accent : theme.colors.text }]}>
                {formatRole(role)}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.segmentRow}>
          {statuses.map((status) => (
            <Pressable
              key={status}
              onPress={() => setField('userStatus', status)}
              style={[
                styles.segment,
                {
                  backgroundColor: editor.userStatus === status ? theme.colors.infoSoft : theme.colors.surfaceAlt,
                  borderColor: editor.userStatus === status ? theme.colors.info : theme.colors.line,
                },
              ]}>
              <Text
                style={[
                  styles.segmentText,
                  { color: editor.userStatus === status ? theme.colors.info : theme.colors.text },
                ]}>
                {status}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.actions}>
          {editingId ? (
            <Pressable onPress={resetEditor} style={[styles.secondaryButton, { borderColor: theme.colors.line }]}>
              <Text style={[styles.secondaryText, { color: theme.colors.text }]}>Cancelar</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => void saveUser()}
            disabled={isSubmitting}
            style={[styles.primaryButton, portalButtonGradient(), isSubmitting ? styles.disabledButton : undefined]}>
            <MaterialCommunityIcons name={editingId ? 'content-save-outline' : 'account-plus-outline'} size={18} color="#FFFFFF" />
            <Text style={styles.primaryText}>{editingId ? 'Guardar' : 'Crear usuario'}</Text>
          </Pressable>
        </View>
      </PortalSectionCard> : null}

      <View style={[styles.contextNotice, { backgroundColor: theme.colors.infoSoft, borderColor: theme.colors.line }]}>
        <View style={[styles.contextIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
          <MaterialCommunityIcons name="account-hard-hat-outline" size={20} color={theme.colors.info} />
        </View>
        <View style={styles.contextCopy}>
          <Text style={[styles.contextTitle, { color: theme.colors.text }]}>Usuarios operativos separados</Text>
          <Text style={[styles.contextText, { color: theme.colors.muted }]}>
            {operationalUsersCount} choferes, supervisores o dispatchers se administran desde el panel operativo.
          </Text>
        </View>
        {showOperationalPanel ? <Pressable onPress={() => router.push('/usuarios' as never)} style={[styles.secondaryButton, { borderColor: theme.colors.line }]}>
          <Text style={[styles.secondaryText, { color: theme.colors.text }]}>Abrir operativo</Text>
        </Pressable> : null}
      </View>

      <PortalSectionCard title="Administradores de cuenta" subtitle={`${administrativeUsers.length} usuarios administrativos`}>
        {administrativeUsers.length ? (
          <View style={styles.list}>
            {administrativeUsers.map((item) => (
              <View key={item.id} style={[styles.userRow, { borderColor: theme.colors.line, backgroundColor: theme.colors.surface }]}>
                <View style={[styles.avatar, { backgroundColor: theme.colors.accentSoft }]}>
                  <Text style={[styles.avatarText, { color: theme.colors.accent }]}>{item.avatar || item.name.slice(0, 2)}</Text>
                </View>
                <View style={styles.userBody}>
                  <Text style={[styles.userName, { color: theme.colors.text }]}>{item.name}</Text>
                  <Text style={[styles.userMeta, { color: theme.colors.muted }]}>
                    {item.email} / {item.accountType === 'company_owner' && item.role === 'owner' ? 'Owner' : formatRole(item.role)} / Ultimo acceso: {formatDate(item.lastAccessAt)}
                  </Text>
                </View>
                <StatusBadge label={formatPortalStatus(item.userStatus || 'active')} tone={getPortalStatusTone(item.userStatus)} />
                <View style={styles.rowActions}>
                  {canManageUsers && item.role !== 'owner' ? (
                    <>
                      <Pressable onPress={() => startEdit(item)} style={[styles.iconAction, { backgroundColor: theme.colors.infoSoft }]}>
                        <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.colors.info} />
                      </Pressable>
                      <Pressable onPress={() => setDeleteTarget(item)} style={[styles.iconAction, { backgroundColor: theme.colors.dangerSoft }]}>
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
            title="Sin usuarios administrativos"
            description="Invita a facturacion o soporte para delegar tareas de cuenta."
          />
        )}
      </PortalSectionCard>

      <ConfirmModal
        visible={Boolean(deleteTarget)}
        danger
        title="Eliminar usuario"
        description={`Se eliminara ${deleteTarget?.name || 'este usuario'} de la cuenta.`}
        confirmLabel="Eliminar"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) {
            void deleteUser(target.id);
          }
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
  primaryButton: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.sm,
    flexShrink: 0,
    flexDirection: 'row',
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
  secondaryButton: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexShrink: 0,
    minHeight: 42,
    paddingHorizontal: 14,
    justifyContent: 'center',
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
  disabledButton: {
    opacity: 0.55,
  },
});
