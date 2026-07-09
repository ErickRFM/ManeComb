import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { AppCard } from '@/src/components/app-card';
import { AppShell } from '@/src/components/app-shell';
import { PrimaryButton } from '@/src/components/primary-button';
import { StatusPill } from '@/src/components/status-pill';
import { UserAvatar } from '@/src/components/user-avatar';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type { Role, User } from '@/src/types/app';
import { formatRole, formatStatus } from '@/src/utils/format';
import { getTextInputProps } from '@/src/utils/text-input-props';

type EditorState = {
  name: string;
  email: string;
  password: string;
  phone: string;
  role: Role;
  status: string;
  shift: string;
  vehicleId: string | null;
};

type Tone = 'positive' | 'warning' | 'danger' | 'info' | 'neutral';

const roleOptions: Role[] = ['admin', 'supervisor'];
const statusOptions = ['online', 'offline', 'patrolling', 'on-route'];

function createBlankEditor(): EditorState {
  return {
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'supervisor',
    status: 'online',
    shift: '',
    vehicleId: null,
  };
}

function buildEditorFromUser(user: User): EditorState {
  return {
    name: user.name,
    email: user.email,
    password: '',
    phone: user.phone,
    role: user.role,
    status: user.status,
    shift: user.shift,
    vehicleId: user.vehicleId,
  };
}

function roleTone(role: Role): Tone {
  if (role === 'admin') return 'danger';
  if (role === 'supervisor') return 'info';
  return 'positive';
}

function statusTone(status: string): Tone {
  if (status === 'offline') return 'neutral';
  if (status === 'online') return 'info';
  return 'positive';
}

export function UsersScreen() {
  const { width } = useWindowDimensions();
  const isCompact = width < 980;
  const isPhone = width < 640;
  const { theme } = useAppTheme();
  const {
    createUser,
    dashboard,
    deleteUser,
    isSubmitting,
    loadUsers,
    updateUser,
    user,
    users,
  } = useAppStore(
    useShallow((state) => ({
      createUser: state.createUser,
      dashboard: state.dashboard,
      deleteUser: state.deleteUser,
      isSubmitting: state.isSubmitting,
      loadUsers: state.loadUsers,
      updateUser: state.updateUser,
      user: state.user,
      users: state.users,
    }))
  );
  const styles = useMemo(() => createStyles(theme, isCompact, isPhone), [theme, isCompact, isPhone]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(createBlankEditor);
  const [helperMessage, setHelperMessage] = useState<string | null>(null);
  const [helperTone, setHelperTone] = useState<'danger' | 'success'>('danger');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const canManageUsers = Boolean(
    user && (user.role === 'admin' || user.role === 'owner')
  );

  useEffect(() => {
    if (canManageUsers) {
      loadUsers().catch(() => undefined);
    }
  }, [canManageUsers, loadUsers]);

  const operationalUsers = useMemo(
    () => users.filter((entry) => entry.accountType !== 'company_owner'),
    [users]
  );

  const totalByRole = useMemo(() => {
    return operationalUsers.reduce(
      (accumulator, currentUser) => {
        accumulator[currentUser.role] = accumulator[currentUser.role] || 0;
        accumulator[currentUser.role] += 1;
        return accumulator;
      },
      {
        owner: 0,
        admin: 0,
        dispatcher: 0,
        supervisor: 0,
        billing_manager: 0,
        support: 0,
        viewer: 0,
        driver: 0,
      } satisfies Record<Role, number>
    );
  }, [operationalUsers]);

  const activeUsers = useMemo(
    () => operationalUsers.filter((entry) => entry.status !== 'offline').length,
    [operationalUsers]
  );

  const assignedDrivers = useMemo(
    () => operationalUsers.filter((entry) => entry.role === 'driver' && entry.vehicleId).length,
    [operationalUsers]
  );

  const availableVehicles = dashboard?.fleet || [];

  const setMessage = (message: string | null, tone: 'danger' | 'success' = 'danger') => {
    setHelperMessage(message);
    setHelperTone(tone);
  };

  const refreshUsers = async () => {
    setIsRefreshing(true);
    try {
      await loadUsers();
    } finally {
      setIsRefreshing(false);
    }
  };

  const updateEditor = <T extends keyof EditorState>(field: T, value: EditorState[T]) => {
    setEditor((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetEditor = (clearMessage = true) => {
    setEditingUserId(null);
    setEditor(createBlankEditor());
    if (clearMessage) {
      setMessage(null);
    }
  };

  const startEditing = (targetUser: User) => {
    setEditingUserId(targetUser.id);
    setEditor(buildEditorFromUser(targetUser));
    setMessage(null);
  };

  const getVehicleCode = (vehicleId?: string | null) => {
    if (!vehicleId) return 'Sin asignacion';
    return availableVehicles.find((vehicle) => vehicle.id === vehicleId)?.code || vehicleId;
  };

  const handleSubmit = async () => {
    if (!editor.name.trim() || !editor.email.trim()) {
      setMessage('Nombre y correo son obligatorios.');
      return;
    }

    if (!editingUserId && !editor.password.trim()) {
      setMessage('La contrasena es obligatoria para crear un usuario.');
      return;
    }

    const payload = {
      accountType: 'operations' as const,
      name: editor.name.trim(),
      email: editor.email.trim(),
      phone: editor.phone.trim(),
      role: editor.role,
      status: editor.status.trim() || 'online',
      shift: editor.shift.trim(),
      vehicleId: editor.role === 'driver' ? editor.vehicleId || null : null,
      ...(editor.password.trim() ? { password: editor.password.trim() } : {}),
    };

    const result = editingUserId ? await updateUser(editingUserId, payload) : await createUser(payload);

    if (!result.ok) {
      setMessage(result.message || 'No fue posible guardar el usuario.');
      return;
    }

    resetEditor(false);
    setMessage(editingUserId ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.', 'success');
  };

  const performDelete = async (targetUser: User) => {
    const result = await deleteUser(targetUser.id);

    if (!result.ok) {
      setMessage(result.message || 'No fue posible eliminar el usuario.');
      return;
    }

    if (editingUserId === targetUser.id) {
      resetEditor();
    }

    setMessage('Usuario eliminado correctamente.', 'success');
  };

  const confirmDelete = (targetUser: User) => {
    if (Platform.OS === 'web') {
      const shouldDelete = globalThis.window?.confirm(
        `Se eliminara a ${targetUser.name}. Esta accion no se puede deshacer.`
      );

      if (shouldDelete) {
        performDelete(targetUser);
      }

      return;
    }

    Alert.alert(
      'Eliminar usuario',
      `Se eliminara a ${targetUser.name}. Esta accion no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            performDelete(targetUser);
          },
        },
      ]
    );
  };

  if (!user) {
    return (
      <AppShell sectionKey="usuarios">
        <AppCard>
          <Text style={styles.title}>Acceso restringido</Text>
          <Text style={styles.subtitle}>Inicia sesion para administrar usuarios.</Text>
        </AppCard>
      </AppShell>
    );
  }

  if (!canManageUsers) {
    return (
      <AppShell sectionKey="usuarios">
        <AppCard>
          <Text style={styles.title}>Solo para administracion</Text>
          <Text style={styles.subtitle}>
            Esta vista permite crear, editar y eliminar cuentas operativas.
          </Text>
        </AppCard>
      </AppShell>
    );
  }

  return (
    <AppShell
      sectionKey="usuarios"
      mobileTitle="Usuarios"
      mobileSubtitle="Altas, roles y unidades."
      onRefresh={refreshUsers}
      refreshing={isRefreshing}
      header={
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>ADMINISTRACION OPERATIVA</Text>
            <Text style={styles.title}>Usuarios, roles y unidades</Text>
            <Text style={styles.subtitle}>
              Cuentas, permisos y unidades operativas.
            </Text>
          </View>
          <PrimaryButton
            label={isRefreshing ? 'Actualizando...' : 'Actualizar'}
            icon="refresh"
            compact
            variant="ghost"
            onPress={() => { refreshUsers(); }}
            disabled={isRefreshing}
          />
        </View>
      }
      mobileBadges={[
        { label: `${operationalUsers.length} cuentas`, tone: 'info' },
        { label: `${assignedDrivers} choferes asignados`, tone: 'positive' },
      ]}>
      <View style={styles.summaryGrid}>
        <SummaryCard icon="shield-account" label="Administradores" tone="danger" value={totalByRole.admin} />
        <SummaryCard icon="account-tie-hat" label="Supervisores" tone="info" value={totalByRole.supervisor} />
        <SummaryCard icon="account-hard-hat" label="Choferes" tone="positive" value={totalByRole.driver} />
        <SummaryCard icon="access-point-check" label="Activos" tone="warning" value={activeUsers} />
      </View>

      <View style={styles.mainGrid}>
        <AppCard style={styles.editorCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>{editingUserId ? 'Editar cuenta' : 'Nueva cuenta operativa'}</Text>
              <Text style={styles.sectionSubtitle}>
                {editingUserId
                  ? 'Actualiza datos, permisos y unidad.'
                  : 'Alta manual para administracion o supervision. Los choferes se activan con key.'}
              </Text>
            </View>
            {editingUserId ? (
              <PrimaryButton label="Cancelar" icon="close" compact variant="ghost" onPress={() => resetEditor()} />
            ) : null}
          </View>

          <View style={styles.formGrid}>
            <Field label="Nombre completo" value={editor.name} onChangeText={(value) => updateEditor('name', value)} />
            <Field
              label="Correo"
              value={editor.email}
              onChangeText={(value) => updateEditor('email', value)}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field
              label={editingUserId ? 'Nueva contrasena (opcional)' : 'Contrasena'}
              value={editor.password}
              onChangeText={(value) => updateEditor('password', value)}
              secureTextEntry
            />
            <Field
              label="Telefono"
              value={editor.phone}
              onChangeText={(value) => updateEditor('phone', value)}
              keyboardType="phone-pad"
            />
            <Field label="Turno" value={editor.shift} onChangeText={(value) => updateEditor('shift', value)} />
          </View>

          <View style={styles.choiceGroup}>
            <Text style={styles.choiceLabel}>Rol operativo</Text>
            <View style={styles.choiceRow}>
              {(editingUserId && editor.role === 'driver' ? [...roleOptions, 'driver' as const] : roleOptions).map((role) => (
                <ChoiceChip
                  key={role}
                  active={editor.role === role}
                  label={formatRole(role)}
                  onPress={() => updateEditor('role', role)}
                />
              ))}
            </View>
          </View>

          <View style={styles.choiceGroup}>
            <Text style={styles.choiceLabel}>Estado</Text>
            <View style={styles.choiceRow}>
              {statusOptions.map((status) => (
                <ChoiceChip
                  key={status}
                  active={editor.status === status}
                  label={formatStatus(status)}
                  onPress={() => updateEditor('status', status)}
                />
              ))}
            </View>
          </View>

          {editor.role === 'driver' ? (
            <View style={styles.choiceGroup}>
              <Text style={styles.choiceLabel}>Unidad asignada</Text>
              <View style={styles.choiceRow}>
                <ChoiceChip active={!editor.vehicleId} label="Sin unidad" onPress={() => updateEditor('vehicleId', null)} />
                {availableVehicles.map((vehicle) => (
                  <ChoiceChip
                    key={vehicle.id}
                    active={editor.vehicleId === vehicle.id}
                    label={vehicle.code}
                    onPress={() => updateEditor('vehicleId', vehicle.id)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {helperMessage ? (
            <View
              style={[
                styles.messageBox,
                {
                  backgroundColor:
                    helperTone === 'success' ? theme.colors.successSoft : theme.colors.dangerSoft,
                  borderColor: helperTone === 'success' ? theme.colors.success : theme.colors.danger,
                },
              ]}>
              <Text
                style={[
                  styles.messageText,
                  { color: helperTone === 'success' ? theme.colors.success : theme.colors.danger },
                ]}>
                {helperMessage}
              </Text>
            </View>
          ) : null}

          <PrimaryButton
            label={isSubmitting ? 'Guardando...' : editingUserId ? 'Actualizar usuario' : 'Crear usuario'}
            icon={editingUserId ? 'content-save-outline' : 'account-plus-outline'}
            onPress={() => { handleSubmit(); }}
            disabled={isSubmitting}
          />
        </AppCard>

        <AppCard style={styles.listCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Directorio operativo</Text>
              <Text style={styles.sectionSubtitle}>
                Cuentas internas de operacion.
              </Text>
            </View>
          </View>

          <View style={styles.usersList}>
            {operationalUsers.length ? (
              operationalUsers.map((entry) => {
                const isCurrentUser = entry.id === user.id;

                return (
                  <View key={entry.id} style={styles.userRow}>
                    <View style={styles.userTop}>
                      <UserAvatar user={entry} status={entry.status} showStatus size={56} />
                      <View style={styles.userMeta}>
                        <View style={styles.userNameRow}>
                          <Text style={styles.userName} numberOfLines={2}>{entry.name}</Text>
                          {isCurrentUser ? <StatusPill label="Tu cuenta" tone="warning" /> : null}
                        </View>
                        <Text style={styles.userEmail} numberOfLines={1}>{entry.email}</Text>
                        <View style={styles.pillsRow}>
                          <StatusPill label={formatRole(entry.role)} tone={roleTone(entry.role)} />
                          <StatusPill label={formatStatus(entry.status)} tone={statusTone(entry.status)} />
                        </View>
                      </View>
                    </View>

                    <View style={styles.detailsGrid}>
                      <DetailItem label="Telefono" value={entry.phone || 'Pendiente'} />
                      <DetailItem label="Turno" value={entry.shift || 'Sin turno'} />
                      <DetailItem label="Unidad" value={getVehicleCode(entry.vehicleId)} />
                    </View>

                    <View style={styles.actionsRow}>
                      <PrimaryButton
                        label="Editar"
                        icon="pencil-outline"
                        compact
                        variant="ghost"
                        onPress={() => startEditing(entry)}
                      />
                      <PrimaryButton
                        label="Eliminar"
                        accessibilityLabel={`Eliminar usuario ${entry.name}`}
                        icon="trash-can-outline"
                        compact
                        variant="ghost"
                        onPress={() => confirmDelete(entry)}
                        disabled={isCurrentUser}
                      />
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="account-search-outline" size={26} color={theme.colors.muted} />
                <Text style={styles.sectionSubtitle}>
                  Aun no hay cuentas operativas. Crea un supervisor aqui o activa choferes con key desde el portal.
                </Text>
              </View>
            )}
          </View>
        </AppCard>
      </View>
    </AppShell>
  );
}

function SummaryCard({
  icon,
  label,
  tone,
  value,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  tone: Tone;
  value: number | string;
}) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const toneColor =
    tone === 'positive'
      ? theme.colors.success
      : tone === 'warning'
        ? theme.colors.warning
        : tone === 'danger'
          ? theme.colors.danger
          : theme.colors.info;
  const toneBackground =
    tone === 'positive'
      ? theme.colors.successSoft
      : tone === 'warning'
        ? theme.colors.warningSoft
        : tone === 'danger'
          ? theme.colors.dangerSoft
          : theme.colors.infoSoft;

  return (
    <AppCard style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: toneBackground }]}>
        <MaterialCommunityIcons name={icon} size={22} color={toneColor} />
      </View>
      <View style={styles.summaryCopy}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
    </AppCard>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  secureTextEntry = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
}) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...getTextInputProps(theme, { autoComplete: secureTextEntry ? 'new-password' : 'off' })}
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor={theme.colors.muted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        style={styles.input}
      />
    </View>
  );
}

function ChoiceChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.choiceChip,
        active
          ? { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent }
          : undefined,
      ]}>
      <Text style={[styles.choiceChipText, { color: active ? theme.colors.accent : theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function createStyles(
  theme: ReturnType<typeof useAppTheme>['theme'],
  isCompact = false,
  isPhone = false
) {
  return StyleSheet.create({
    header: {
      alignItems: 'flex-start',
      flexDirection: isPhone ? 'column' : 'row',
      gap: AppTheme.spacing.sm,
      justifyContent: 'space-between',
      paddingTop: isPhone ? AppTheme.spacing.sm : AppTheme.spacing.md,
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
      gap: 8,
      maxWidth: 760,
    },
    eyebrow: {
      color: theme.colors.accent,
      fontFamily: Typography.body,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.4,
    },
    title: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: isPhone ? 24 : 30,
      fontWeight: '900',
    },
    subtitle: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: isPhone ? 13 : 14,
      lineHeight: isPhone ? 20 : 21,
    },
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: isPhone ? AppTheme.spacing.sm : AppTheme.spacing.md,
    },
    summaryCard: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: 12,
      minWidth: isPhone ? '100%' : 180,
      padding: AppTheme.spacing.sm,
    },
    summaryIcon: {
      alignItems: 'center',
      borderRadius: 14,
      height: 42,
      justifyContent: 'center',
      width: 42,
    },
    summaryCopy: {
      flex: 1,
      gap: 2,
    },
    summaryLabel: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      fontWeight: '800',
    },
    summaryValue: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: isPhone ? 23 : 26,
      fontWeight: '900',
    },
    mainGrid: {
      flexDirection: isCompact ? 'column' : 'row',
      flexWrap: 'wrap',
      alignItems: isCompact ? 'stretch' : 'flex-start',
      width: '100%',
      gap: isPhone ? AppTheme.spacing.sm : AppTheme.spacing.md,
    },
    editorCard: {
      flex: 0.9,
      width: isCompact ? '100%' : undefined,
      minWidth: isPhone ? 0 : 330,
      maxWidth: isCompact ? undefined : 520,
    },
    listCard: {
      flex: 1.35,
      width: isCompact ? '100%' : undefined,
      minWidth: isPhone ? 0 : 420,
    },
    sectionHeader: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      justifyContent: 'space-between',
    },
    sectionCopy: {
      flex: 1,
      gap: 6,
      minWidth: isPhone ? '100%' : 220,
    },
    sectionTitle: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: isPhone ? 19 : 22,
      fontWeight: '900',
    },
    sectionSubtitle: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: isPhone ? 13 : 14,
      lineHeight: isPhone ? 20 : 22,
      maxWidth: 520,
    },
    formGrid: {
      gap: 10,
    },
    field: {
      gap: 8,
    },
    fieldLabel: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    input: {
      backgroundColor: theme.colors.input,
      borderColor: theme.colors.line,
      borderRadius: AppTheme.radius.md,
      borderWidth: 1,
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: isPhone ? 14 : 15,
      minHeight: isPhone ? 46 : 48,
      paddingHorizontal: AppTheme.spacing.md,
    },
    choiceGroup: {
      gap: 10,
    },
    choiceLabel: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    choiceRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    choiceChip: {
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: theme.colors.line,
      borderRadius: AppTheme.radius.pill,
      borderWidth: 1,
      paddingHorizontal: isPhone ? 12 : 14,
      paddingVertical: isPhone ? 7 : 8,
    },
    choiceChipText: {
      fontFamily: Typography.body,
      fontSize: 12,
      fontWeight: '800',
    },
    messageBox: {
      borderRadius: AppTheme.radius.md,
      borderWidth: 1,
      paddingHorizontal: AppTheme.spacing.md,
      paddingVertical: 12,
    },
    messageText: {
      fontFamily: Typography.body,
      fontSize: 14,
      fontWeight: '800',
    },
    usersList: {
      gap: AppTheme.spacing.md,
    },
    userRow: {
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: theme.colors.line,
      borderRadius: AppTheme.radius.md,
      borderWidth: 1,
      gap: isPhone ? 10 : 12,
      padding: isPhone ? AppTheme.spacing.sm : AppTheme.spacing.md,
    },
    userTop: {
      alignItems: 'flex-start',
      flexDirection: isPhone ? 'column' : 'row',
      gap: 12,
    },
    userMeta: {
      flex: 1,
      gap: 6,
      minWidth: 0,
    },
    userNameRow: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    userName: {
      flexShrink: 1,
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: isPhone ? 17 : 19,
      fontWeight: '900',
    },
    userEmail: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: isPhone ? 13 : 14,
      minWidth: 0,
    },
    pillsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    detailsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    detailItem: {
      backgroundColor: theme.colors.card,
      borderRadius: AppTheme.radius.md,
      flex: 1,
      gap: 6,
      minWidth: isPhone ? '100%' : 150,
      padding: AppTheme.spacing.sm,
    },
    detailLabel: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      fontWeight: '800',
    },
    detailValue: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: isPhone ? 13 : 14,
      fontWeight: '800',
    },
    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      justifyContent: isPhone ? 'flex-start' : 'flex-end',
      minWidth: 0,
    },
    emptyState: {
      alignItems: 'flex-start',
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: theme.colors.line,
      borderRadius: AppTheme.radius.md,
      borderWidth: 1,
      gap: 10,
      padding: AppTheme.spacing.md,
    },
  });
}
