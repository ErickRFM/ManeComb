import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAdminStore } from '@/features/auth/store';
import { palette, Typography } from '@/styles/theme';
import { AdminShell } from '../components/admin-shell';
import { usePlatformStore } from '../store';
import { usePlatformGovernanceStore } from './store';
import type {
  GovernanceActionPayload,
  GovernanceActionType,
  PlatformGovernanceSession,
  PlatformInternalUser,
} from './types';

const ROLES = [
  'platform_admin',
  'platform_support',
  'platform_finance',
  'platform_viewer',
  'platform_owner',
];

const ROLE_LABELS: Record<string, string> = {
  platform_admin: 'Administrador',
  platform_support: 'Soporte',
  platform_finance: 'Finanzas',
  platform_viewer: 'Consulta',
  platform_owner: 'Propietario',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  disabled: 'Deshabilitado',
  pending: 'Pendiente',
  revoked: 'Revocado',
  suspended: 'Suspendido',
  verified: 'Verificado',
  true: 'Verificado',
  false: 'Pendiente',
};

const ACTION_LABELS: Record<GovernanceActionType, string> = {
  'platform.user.reactivate': 'Reactivar usuario',
  'platform.user.suspend': 'Suspender usuario',
  'platform.user.role.change': 'Cambiar rol',
  'platform.sessions.revoke_all': 'Cerrar sus sesiones',
  'platform.session.revoke': 'Revocar sesión',
};

function formatDate(value: string | null | undefined) {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Sin registro'
    : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatRole(value: string) {
  return ROLE_LABELS[value] || value.replace('platform_', '').replaceAll('_', ' ');
}

function formatStatus(value: string | boolean) {
  const normalized = String(value);
  return STATUS_LABELS[normalized] || normalized.replaceAll('_', ' ');
}

function StateCard({ title, body, danger = false, action, onAction }: {
  title: string;
  body: string;
  danger?: boolean;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View accessibilityRole={danger ? 'alert' : undefined} style={[styles.stateCard, danger && styles.dangerCard]}>
      <Text style={[styles.stateTitle, danger && styles.dangerText]}>{title}</Text>
      <Text style={styles.stateBody}>{body}</Text>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function StatusBadge({ value }: { value: string | boolean }) {
  const normalized = String(value);
  const style = ['active', 'true', 'verified'].includes(normalized)
    ? styles.goodBadge
    : ['suspended', 'false', 'revoked', 'disabled'].includes(normalized)
      ? styles.badBadge
      : styles.neutralBadge;
  return <Text style={[styles.badge, style]}>{formatStatus(value)}</Text>;
}

export function AdminTeamScreen() {
  const token = useAdminStore((state) => state.session?.token || '');
  const currentUserId = useAdminStore((state) => state.session?.user.id || '');
  const capabilities = usePlatformStore((state) => state.capabilities);
  const teamState = usePlatformGovernanceStore((state) => state.teamState);
  const teamError = usePlatformGovernanceStore((state) => state.teamError);
  const users = usePlatformGovernanceStore((state) => state.users);
  const pagination = usePlatformGovernanceStore((state) => state.teamPagination);
  const loadTeam = usePlatformGovernanceStore((state) => state.loadTeam);
  const createState = usePlatformGovernanceStore((state) => state.createState);
  const createError = usePlatformGovernanceStore((state) => state.createError);
  const createUser = usePlatformGovernanceStore((state) => state.createUser);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PlatformInternalUser | null>(null);

  const canExecuteActions = Boolean(
    capabilities?.modules.actions && capabilities.user.role === 'platform_owner'
  );

  useEffect(() => {
    if (token) void loadTeam(token, { page: 1, limit: 30, sort: 'name', order: 'asc' });
  }, [loadTeam, token]);

  const loadPage = (page: number) => token && void loadTeam(token, {
    page,
    limit: 30,
    search,
    sort: 'name',
    order: 'asc',
  });

  return (
    <AdminShell
      actions={(
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showCreate }} onPress={() => setShowCreate((value) => !value)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{showCreate ? 'Cerrar formulario' : 'Nuevo usuario'}</Text>
        </Pressable>
      )}
      title="Personal interno"
      subtitle="Administra las cuentas internas de ManeComb. Todas requieren MFA y las contraseñas temporales no quedan guardadas en la interfaz."
    >
      {showCreate ? (
        <CreateUserPanel
          canCreateOwner={capabilities?.user.role === 'platform_owner'}
          createError={createError}
          createState={createState}
          onCreate={async (payload) => {
            const created = await createUser(token, payload);
            if (created) {
              setShowCreate(false);
              await loadTeam(token, { page: 1, limit: 30, sort: 'name', order: 'asc' });
            }
          }}
        />
      ) : null}

      <View style={styles.filterCard}>
        <TextInput
          accessibilityLabel="Buscar personal interno"
          autoCapitalize="none"
          onChangeText={setSearch}
          onSubmitEditing={() => loadPage(1)}
          placeholder="Nombre, correo, rol o estado"
          placeholderTextColor={palette.mutedSoft}
          returnKeyType="search"
          style={styles.input}
          value={search}
        />
        <Pressable accessibilityRole="button" onPress={() => loadPage(1)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Buscar</Text>
        </Pressable>
      </View>

      {teamState === 'loading' || teamState === 'idle' ? (
        <StateCard body="Consultando el personal interno." title="Cargando personal…" />
      ) : null}
      {teamState === 'error' ? (
        <StateCard action="Reintentar" body={teamError || 'No fue posible cargar el personal.'} danger onAction={() => loadPage(pagination?.page || 1)} title="Error de consulta" />
      ) : null}
      {teamState === 'ready' && users.length === 0 ? (
        <StateCard body="No hay usuarios que coincidan con la búsqueda actual." title="Sin resultados" />
      ) : null}

      <View style={styles.grid}>
        {users.map((user) => {
          const isCurrent = user.id === currentUserId;
          return (
            <View key={user.id} style={styles.userCard}>
              <View style={styles.cardHeader}>
                <View style={styles.flex}>
                  <Text accessibilityRole="header" style={styles.cardTitle}>{user.name}</Text>
                  <Text style={styles.mono}>{user.email}</Text>
                </View>
                <StatusBadge value={user.status} />
              </View>
              <View style={styles.infoGrid}>
                <Info label="Rol" value={formatRole(user.role)} />
                <Info label="MFA" value={user.mfaEnabled ? 'Configurado' : 'Pendiente'} />
                <Info label="Último acceso" value={formatDate(user.lastLoginAt)} />
                <Info label="Creada" value={formatDate(user.createdAt)} />
              </View>
              {user.suspendedReason ? <Text style={styles.reasonText}>Razón: {user.suspendedReason}</Text> : null}
              <View style={styles.cardActions}>
                {isCurrent ? <Text style={styles.currentLabel}>Cuenta actual</Text> : null}
                {canExecuteActions && !isCurrent ? (
                  <Pressable accessibilityRole="button" onPress={() => setSelectedUser(user)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Administrar</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      {pagination ? (
        <Pagination
          hasNext={pagination.hasNext}
          hasPrev={pagination.hasPrev}
          label={`Página ${pagination.page} de ${pagination.totalPages} · ${pagination.total} usuarios`}
          onNext={() => loadPage(pagination.page + 1)}
          onPrev={() => loadPage(pagination.page - 1)}
        />
      ) : null}

      {selectedUser ? (
        <ControlledActionPanel
          actions={[
            selectedUser.status === 'suspended' ? 'platform.user.reactivate' : 'platform.user.suspend',
            'platform.user.role.change',
            'platform.sessions.revoke_all',
          ]}
          onClose={() => setSelectedUser(null)}
          onSuccess={async () => {
            setSelectedUser(null);
            await loadTeam(token, { page: pagination?.page || 1, limit: 30, search, sort: 'name', order: 'asc' });
          }}
          targetId={selectedUser.id}
          targetLabel={`${selectedUser.name} · ${selectedUser.email}`}
        />
      ) : null}
    </AdminShell>
  );
}

function CreateUserPanel({ canCreateOwner, createState, createError, onCreate }: {
  canCreateOwner: boolean;
  createState: string;
  createError: string | null;
  onCreate: (payload: { name: string; email: string; password: string; role: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('platform_viewer');
  const allowedRoles = canCreateOwner ? ROLES : ROLES.filter((item) => item !== 'platform_owner');
  const isSubmitting = createState === 'loading';
  const canSubmit = Boolean(!isSubmitting && name.trim() && email.trim() && password.length >= 12);

  return (
    <View style={styles.panel}>
      <Text accessibilityRole="header" style={styles.panelTitle}>Crear usuario interno</Text>
      <Text style={styles.panelBody}>La contraseña es temporal, no se persiste en el navegador y la cuenta deberá enrolar MFA.</Text>
      <View style={styles.formGrid}>
        <TextInput accessibilityLabel="Nombre completo" editable={!isSubmitting} onChangeText={setName} placeholder="Nombre completo" placeholderTextColor={palette.mutedSoft} style={styles.input} value={name} />
        <TextInput accessibilityLabel="Correo del usuario interno" autoCapitalize="none" autoComplete="email" editable={!isSubmitting} keyboardType="email-address" onChangeText={setEmail} placeholder="correo@manecomb.com" placeholderTextColor={palette.mutedSoft} style={styles.input} textContentType="emailAddress" value={email} />
        <TextInput accessibilityLabel="Contraseña temporal" autoCapitalize="none" editable={!isSubmitting} onChangeText={setPassword} placeholder="Contraseña temporal (12+ caracteres)" placeholderTextColor={palette.mutedSoft} secureTextEntry style={styles.input} textContentType="newPassword" value={password} />
      </View>
      <Text style={styles.fieldHint}>Rol inicial</Text>
      <ScrollView contentContainerStyle={styles.chips} horizontal showsHorizontalScrollIndicator={false}>
        {allowedRoles.map((item) => {
          const active = role === item;
          return (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} key={item} onPress={() => setRole(item)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{formatRole(item)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {createError ? <Text accessibilityRole="alert" style={styles.errorText}>{createError}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit, busy: isSubmitting }}
        disabled={!canSubmit}
        onPress={() => void onCreate({ name: name.trim(), email: email.trim(), password, role })}
        style={[styles.primaryButton, !canSubmit && styles.disabled]}
      >
        <Text style={styles.primaryButtonText}>{isSubmitting ? 'Creando…' : 'Crear cuenta interna'}</Text>
      </Pressable>
    </View>
  );
}

export function AdminSessionsScreen() {
  const token = useAdminStore((state) => state.session?.token || '');
  const capabilities = usePlatformStore((state) => state.capabilities);
  const state = usePlatformGovernanceStore((store) => store.sessionsState);
  const error = usePlatformGovernanceStore((store) => store.sessionsError);
  const sessions = usePlatformGovernanceStore((store) => store.sessions);
  const pagination = usePlatformGovernanceStore((store) => store.sessionsPagination);
  const loadSessions = usePlatformGovernanceStore((store) => store.loadSessions);
  const [activeOnly, setActiveOnly] = useState(true);
  const [selectedSession, setSelectedSession] = useState<PlatformGovernanceSession | null>(null);
  const canExecuteActions = Boolean(capabilities?.modules.actions && capabilities.user.role === 'platform_owner');

  useEffect(() => {
    if (token) void loadSessions(token, { page: 1, limit: 40, activeOnly, sort: 'lastSeenAt', order: 'desc' });
  }, [activeOnly, loadSessions, token]);

  const loadPage = (page: number) => token && void loadSessions(token, { page, limit: 40, activeOnly, sort: 'lastSeenAt', order: 'desc' });

  return (
    <AdminShell title="Sesiones" subtitle="Accesos del personal interno y estado MFA. La API no entrega IP, user-agent ni hashes de refresh al frontend.">
      <View style={styles.filterCard}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: activeOnly }} onPress={() => setActiveOnly((value) => !value)} style={[styles.chip, activeOnly && styles.chipActive]}>
          <Text style={[styles.chipText, activeOnly && styles.chipTextActive]}>{activeOnly ? 'Solo activas' : 'Todas las sesiones'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => loadPage(pagination?.page || 1)} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Actualizar</Text>
        </Pressable>
      </View>

      {state === 'loading' || state === 'idle' ? <StateCard body="Consultando sesiones internas." title="Cargando sesiones…" /> : null}
      {state === 'error' ? <StateCard action="Reintentar" body={error || 'No fue posible cargar las sesiones.'} danger onAction={() => loadPage(pagination?.page || 1)} title="Error de consulta" /> : null}
      {state === 'ready' && sessions.length === 0 ? <StateCard body="No hay sesiones que coincidan con el filtro actual." title="Sin sesiones" /> : null}

      {sessions.map((session) => (
        <View key={session.id} style={styles.sessionRow}>
          <View style={styles.sessionIdentity}>
            <Text accessibilityRole="header" style={styles.cardTitle}>{session.user?.name || 'Usuario no disponible'}</Text>
            <Text style={styles.mono}>{session.user?.email || session.userId}</Text>
          </View>
          <Info label="Dispositivo" value={`${session.deviceName} · ${session.platform}`} />
          <Info label="Última actividad" value={formatDate(session.lastSeenAt)} />
          <Info label="Expira" value={formatDate(session.expiresAt)} />
          <StatusBadge value={session.mfaVerified ? 'verified' : 'pending'} />
          {session.current ? <Text style={styles.currentLabel}>Actual</Text> : null}
          {canExecuteActions && session.isActive && !session.current ? (
            <Pressable accessibilityRole="button" onPress={() => setSelectedSession(session)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Revocar</Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      {pagination ? (
        <Pagination
          hasNext={pagination.hasNext}
          hasPrev={pagination.hasPrev}
          label={`Página ${pagination.page} de ${pagination.totalPages} · ${pagination.total} sesiones`}
          onNext={() => loadPage(pagination.page + 1)}
          onPrev={() => loadPage(pagination.page - 1)}
        />
      ) : null}

      {selectedSession ? (
        <ControlledActionPanel
          actions={['platform.session.revoke']}
          onClose={() => setSelectedSession(null)}
          onSuccess={async () => {
            setSelectedSession(null);
            await loadSessions(token, { page: pagination?.page || 1, limit: 40, activeOnly, sort: 'lastSeenAt', order: 'desc' });
          }}
          targetId={selectedSession.id}
          targetLabel={`${selectedSession.user?.name || selectedSession.userId} · ${selectedSession.deviceName}`}
        />
      ) : null}
    </AdminShell>
  );
}

function ControlledActionPanel({ actions, targetId, targetLabel, onClose, onSuccess }: {
  actions: GovernanceActionType[];
  targetId: string;
  targetLabel: string;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const token = useAdminStore((state) => state.session?.token || '');
  const actionState = usePlatformGovernanceStore((state) => state.actionState);
  const actionError = usePlatformGovernanceStore((state) => state.actionError);
  const pendingAction = usePlatformGovernanceStore((state) => state.pendingAction);
  const lastResult = usePlatformGovernanceStore((state) => state.lastActionResult);
  const submitAction = usePlatformGovernanceStore((state) => state.submitAction);
  const retryAction = usePlatformGovernanceStore((state) => state.retryAction);
  const clearAction = usePlatformGovernanceStore((state) => state.clearAction);
  const [action, setAction] = useState<GovernanceActionType>(actions[0]);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [nextRole, setNextRole] = useState('platform_viewer');
  const expectedConfirmation = `CONFIRM ${action}`;
  const canSubmit = actionState !== 'loading' && reason.trim().length >= 10 && confirmation.trim() === expectedConfirmation;

  useEffect(() => {
    clearAction();
    return () => clearAction();
  }, [clearAction]);

  const submit = async () => {
    const payload: GovernanceActionPayload = {
      action,
      targetId,
      reason: reason.trim(),
      confirmation: confirmation.trim(),
      ...(action === 'platform.user.role.change' ? { nextRole } : {}),
    };
    const result = await submitAction(token, payload);
    if (result) await onSuccess();
  };

  const retry = async () => {
    const result = await retryAction(token);
    if (result) await onSuccess();
  };

  return (
    <View accessibilityViewIsModal style={styles.actionOverlay}>
      <ScrollView contentContainerStyle={styles.actionOverlayContent} keyboardShouldPersistTaps="handled">
        <View style={styles.actionPanel}>
          <View style={styles.cardHeader}>
            <View style={styles.flex}>
              <Text accessibilityRole="header" style={styles.panelTitle}>Acción controlada</Text>
              <Text style={styles.panelBody}>{targetLabel}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cerrar</Text></Pressable>
          </View>

          <Text style={styles.fieldHint}>Acción</Text>
          <ScrollView contentContainerStyle={styles.chips} horizontal showsHorizontalScrollIndicator={false}>
            {actions.map((item) => {
              const active = action === item;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={item}
                  onPress={() => { setAction(item); setConfirmation(''); clearAction(); }}
                  style={[styles.chip, active && styles.chipDanger]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{ACTION_LABELS[item]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {action === 'platform.user.role.change' ? (
            <>
              <Text style={styles.fieldHint}>Nuevo rol</Text>
              <ScrollView contentContainerStyle={styles.chips} horizontal showsHorizontalScrollIndicator={false}>
                {ROLES.map((role) => {
                  const active = nextRole === role;
                  return (
                    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} key={role} onPress={() => setNextRole(role)} style={[styles.chip, active && styles.chipActive]}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{formatRole(role)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          <TextInput
            accessibilityLabel="Razón de la acción"
            multiline
            onChangeText={setReason}
            placeholder="Razón operativa obligatoria (mínimo 10 caracteres)"
            placeholderTextColor={palette.mutedSoft}
            style={[styles.input, styles.reasonInput]}
            value={reason}
          />
          <Text style={styles.confirmationHelp}>Para confirmar, escribe exactamente: {expectedConfirmation}</Text>
          <TextInput
            accessibilityLabel="Confirmación de acción sensible"
            autoCapitalize="none"
            onChangeText={setConfirmation}
            placeholder={expectedConfirmation}
            placeholderTextColor={palette.mutedSoft}
            style={styles.input}
            value={confirmation}
          />

          {actionError ? <Text accessibilityRole="alert" style={styles.errorText}>{actionError}</Text> : null}
          {pendingAction && actionState === 'error' ? (
            <Text style={styles.pendingText}>El reintento conservará la misma Idempotency-Key para evitar duplicar la acción.</Text>
          ) : null}
          {lastResult ? <Text style={styles.successText}>Acción completada correctamente.</Text> : null}

          <View style={styles.cardActions}>
            {actionState === 'error' && pendingAction ? (
              <Pressable accessibilityRole="button" onPress={() => void retry()} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Reintentar misma acción</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit, busy: actionState === 'loading' }}
              disabled={!canSubmit}
              onPress={() => void submit()}
              style={[styles.dangerButton, !canSubmit && styles.disabled]}
            >
              <Text style={styles.dangerButtonText}>{actionState === 'loading' ? 'Ejecutando…' : 'Ejecutar acción'}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoItem}><Text style={styles.infoLabel}>{label}</Text><Text numberOfLines={2} style={styles.infoValue}>{value}</Text></View>;
}

function Pagination({ label, hasPrev, hasNext, onPrev, onNext }: {
  label: string;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <View style={styles.pagination}>
      <Text style={styles.stateBody}>{label}</Text>
      <View style={styles.cardActions}>
        <Pressable accessibilityRole="button" disabled={!hasPrev} onPress={onPrev} style={[styles.secondaryButton, !hasPrev && styles.disabled]}><Text style={styles.secondaryButtonText}>Anterior</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={!hasNext} onPress={onNext} style={[styles.secondaryButton, !hasNext && styles.disabled]}><Text style={styles.secondaryButtonText}>Siguiente</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  filterCard: { alignItems: 'center', backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 16 },
  input: { backgroundColor: palette.surfaceAlt, borderColor: palette.line, borderRadius: 10, borderWidth: 1, color: palette.text, flex: 1, fontFamily: Typography.body, minHeight: 44, minWidth: 220, paddingHorizontal: 14, paddingVertical: 10 },
  primaryButton: { alignItems: 'center', backgroundColor: palette.accent, borderRadius: 10, justifyContent: 'center', minHeight: 44, paddingHorizontal: 17 },
  primaryButtonText: { color: '#fff', fontFamily: Typography.body, fontSize: 11, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', borderColor: palette.lineStrong, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 13 },
  secondaryButtonText: { color: palette.muted, fontFamily: Typography.body, fontSize: 10, fontWeight: '900' },
  dangerButton: { alignItems: 'center', backgroundColor: palette.danger, borderRadius: 9, justifyContent: 'center', minHeight: 44, paddingHorizontal: 15 },
  dangerButtonText: { color: '#fff', fontFamily: Typography.body, fontSize: 11, fontWeight: '900' },
  disabled: { opacity: 0.35 },
  stateCard: { backgroundColor: palette.card, borderColor: palette.line, borderRadius: 14, borderWidth: 1, gap: 8, padding: 18 },
  dangerCard: { backgroundColor: 'rgba(240,106,106,.08)', borderColor: 'rgba(240,106,106,.28)' },
  stateTitle: { color: palette.text, fontFamily: Typography.display, fontSize: 16, fontWeight: '900' },
  stateBody: { color: palette.muted, fontFamily: Typography.body, fontSize: 11, lineHeight: 17 },
  dangerText: { color: palette.danger },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  userCard: { backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16, borderWidth: 1, flexGrow: 1, minWidth: 280, padding: 17, width: '48%' },
  cardHeader: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  flex: { flex: 1, minWidth: 170 },
  cardTitle: { color: palette.text, fontFamily: Typography.display, fontSize: 16, fontWeight: '900' },
  mono: { color: palette.mutedSoft, fontFamily: Typography.mono, fontSize: 9, marginTop: 4 },
  badge: { borderRadius: 999, fontFamily: Typography.body, fontSize: 9, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 },
  goodBadge: { backgroundColor: 'rgba(53,200,107,.14)', color: palette.success },
  badBadge: { backgroundColor: 'rgba(240,106,106,.14)', color: palette.danger },
  neutralBadge: { backgroundColor: palette.surfaceAlt, color: palette.muted },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 17 },
  infoItem: { flexGrow: 1, minWidth: 120 },
  infoLabel: { color: palette.mutedSoft, fontFamily: Typography.body, fontSize: 9, textTransform: 'uppercase' },
  infoValue: { color: palette.text, fontFamily: Typography.body, fontSize: 10, fontWeight: '800', marginTop: 4 },
  reasonText: { color: palette.warning, fontFamily: Typography.body, fontSize: 10, lineHeight: 15, marginTop: 14 },
  cardActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 9, justifyContent: 'flex-end', marginTop: 15 },
  currentLabel: { color: palette.info, fontFamily: Typography.body, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  panel: { backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16, borderWidth: 1, gap: 13, padding: 19 },
  panelTitle: { color: palette.text, fontFamily: Typography.display, fontSize: 18, fontWeight: '900' },
  panelBody: { color: palette.muted, fontFamily: Typography.body, fontSize: 11, lineHeight: 17 },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fieldHint: { color: palette.mutedSoft, fontFamily: Typography.body, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  chips: { gap: 8 },
  chip: { alignItems: 'center', backgroundColor: palette.surfaceAlt, borderColor: palette.line, borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 13 },
  chipActive: { backgroundColor: palette.accentSoft, borderColor: 'rgba(227,30,36,.35)' },
  chipDanger: { backgroundColor: 'rgba(240,106,106,.12)', borderColor: 'rgba(240,106,106,.35)' },
  chipText: { color: palette.muted, fontFamily: Typography.body, fontSize: 9, fontWeight: '900' },
  chipTextActive: { color: palette.text },
  errorText: { color: palette.danger, fontFamily: Typography.body, fontSize: 10, lineHeight: 15 },
  successText: { color: palette.success, fontFamily: Typography.body, fontSize: 10, lineHeight: 15 },
  pendingText: { color: palette.warning, fontFamily: Typography.body, fontSize: 10, lineHeight: 15 },
  sessionRow: { alignItems: 'center', backgroundColor: palette.card, borderColor: palette.line, borderRadius: 14, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 13, padding: 15 },
  sessionIdentity: { flex: 1, minWidth: 200 },
  pagination: { alignItems: 'center', backgroundColor: palette.card, borderColor: palette.line, borderRadius: 14, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', padding: 14 },
  actionOverlay: { backgroundColor: 'rgba(3,7,18,.88)', bottom: 0, left: 0, position: 'fixed' as any, right: 0, top: 0, zIndex: 100 },
  actionOverlayContent: { flexGrow: 1, justifyContent: 'center', padding: 18 },
  actionPanel: { alignSelf: 'center', backgroundColor: '#0C121C', borderColor: palette.lineStrong, borderRadius: 18, borderWidth: 1, gap: 14, maxWidth: 760, padding: 20, width: '100%' },
  reasonInput: { minHeight: 96, textAlignVertical: 'top' },
  confirmationHelp: { color: palette.warning, fontFamily: Typography.mono, fontSize: 10, lineHeight: 15 },
});
