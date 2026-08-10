import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, DesignSystem, Typography, type DesignTone as Tone } from '@/constants/theme';
import {
  assignDriverVehicleRequest,
  createManagedVehicleRequest,
  deleteDriverRequest,
  deleteManagedVehicleRequest,
  getAdminDocumentsForOwnerRequest,
  getDriverLifecycleImpactRequest,
  getManagedVehiclesRequest,
  getVehicleDeletionImpactRequest,
  offboardDriverRequest,
  reactivateDriverRequest,
  retireVehicleRequest,
  updateManagedVehicleRequest,
  type DriverLifecycleImpact,
  type ManagedVehicle,
  type VehicleDeletionImpact,
} from '@/src/api/directory-admin-api';
import { getApiErrorMessage } from '@/src/api/client';
import { AppCard } from '@/src/components/app-card';
import { AppShell } from '@/src/components/app-shell';
import { PresenceBadge } from '@/src/components/presence-indicator';
import { StatusPill } from '@/src/components/status-pill';
import { UserAvatar } from '@/src/components/user-avatar';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { openAuthenticatedDocument } from '@/src/native/document-files';
import { getDocumentStatus } from '@/src/screens/documents/documents.utils';
import { useAppStore } from '@/src/store/use-app-store';
import type { DocumentItem, Role, User, Vehicle } from '@/src/types/app';
import { formatRole } from '@/src/utils/format';
import {
  canManageMobileDocuments,
  canManageMobileUsers,
  canManageMobileVehicles,
} from '@/src/utils/mobile-authority';
import { formatOperationalSchedule, getOperationalScheduleState } from '@/src/utils/operational-schedule';
import { getPresenceStatus } from '@/src/utils/presence';
import { DriverScheduleModal } from './users/DriverScheduleModal';
import {
  canConfirmDirectoryDriverAction,
  canConfirmDirectoryVehicleAction,
  type DirectoryDriverActionKind,
  type DirectoryVehicleActionKind,
} from './users/directory-action-state';

type DirectoryTab = 'personal' | 'vehicles';
type DriverActionKind = DirectoryDriverActionKind;
type VehicleActionKind = DirectoryVehicleActionKind;
type VehicleDraft = {
  code: string;
  plate: string;
  status: 'available' | 'maintenance';
  currentKilometers: string;
};

function roleTone(role: Role): Tone {
  if (role === 'admin') return 'danger';
  if (role === 'supervisor') return 'info';
  return role === 'driver' ? 'positive' : 'neutral';
}

function accountStatusTone(status?: string): Tone {
  if (status === 'active') return 'positive';
  if (status === 'suspended' || status === 'blocked') return 'danger';
  if (status === 'invited' || status === 'pending') return 'warning';
  return 'neutral';
}

function formatAccountStatus(status?: string, role?: Role) {
  if (status === 'active') return 'Cuenta activa';
  if (status === 'suspended') return role === 'driver' ? 'Dado de baja' : 'Cuenta suspendida';
  if (status === 'blocked') return 'Cuenta bloqueada';
  if (status === 'invited') return 'Invitación pendiente';
  if (status === 'pending') return 'Cuenta pendiente';
  return 'Estado no disponible';
}

function vehicleStatusTone(vehicle: ManagedVehicle): Tone {
  if (vehicle.retiredAt) return 'danger';
  if (vehicle.status === 'maintenance') return 'warning';
  return 'positive';
}

function formatVehicleStatus(vehicle: ManagedVehicle) {
  if (vehicle.retiredAt) return 'Unidad retirada';
  if (vehicle.status === 'maintenance') return 'Mantenimiento';
  return 'Disponible';
}

function getVehicleRoute(vehicle?: Vehicle) {
  if (!vehicle) return 'Sin ruta asignada';
  return vehicle.assignedRoute?.route?.label || vehicle.assignedRoute?.destinationLabel || vehicle.routeName || 'Sin ruta asignada';
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sin registro' : date.toLocaleString('es-MX');
}

function createEmptyVehicleDraft(): VehicleDraft {
  return { code: '', plate: '', status: 'available', currentKilometers: '' };
}

function driverActionTitle(kind?: DriverActionKind) {
  if (kind === 'offboard') return 'Dar de baja al conductor';
  if (kind === 'reactivate') return 'Reactivar conductor';
  return 'Eliminar conductor';
}

function driverActionConfirmLabel(kind?: DriverActionKind) {
  if (kind === 'offboard') return 'Dar de baja';
  if (kind === 'reactivate') return 'Reactivar';
  return 'Eliminar definitivamente';
}

export function UsersScreen() {
  const { width } = useWindowDimensions();
  const isPhone = width < DesignSystem.breakpoints.phone;
  const { theme } = useAppTheme();
  const { loadUsers, mapData, presenceByUser, token, user, users } = useAppStore(
    useShallow((state) => ({
      loadUsers: state.loadUsers,
      mapData: state.mapData,
      presenceByUser: state.presenceByUser,
      token: state.token,
      user: state.user,
      users: state.users,
    }))
  );
  const styles = useMemo(() => createStyles(theme, isPhone), [theme, isPhone]);
  const [activeTab, setActiveTab] = useState<DirectoryTab>('personal');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [managedVehicles, setManagedVehicles] = useState<ManagedVehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);

  const [documentsOwner, setDocumentsOwner] = useState<{ id: string; name: string; ownerType: 'driver' | 'vehicle' } | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);
  const [scheduleDriver, setScheduleDriver] = useState<User | null>(null);

  const [driverAction, setDriverAction] = useState<{ kind: DriverActionKind; target: User } | null>(null);
  const [driverImpact, setDriverImpact] = useState<DriverLifecycleImpact | null>(null);
  const [driverImpactLoading, setDriverImpactLoading] = useState(false);
  const [driverImpactError, setDriverImpactError] = useState<string | null>(null);
  const [driverActionSubmitting, setDriverActionSubmitting] = useState(false);
  const [driverReason, setDriverReason] = useState('');
  const [driverConfirmation, setDriverConfirmation] = useState('');
  const driverImpactRequestId = useRef(0);

  const [vehicleEditor, setVehicleEditor] = useState<ManagedVehicle | 'new' | null>(null);
  const [vehicleDraft, setVehicleDraft] = useState<VehicleDraft>(createEmptyVehicleDraft());
  const [vehicleSaving, setVehicleSaving] = useState(false);
  const [vehicleAction, setVehicleAction] = useState<{ kind: VehicleActionKind; target: ManagedVehicle } | null>(null);
  const [vehicleImpact, setVehicleImpact] = useState<VehicleDeletionImpact | null>(null);
  const [vehicleImpactLoading, setVehicleImpactLoading] = useState(false);
  const [vehicleImpactError, setVehicleImpactError] = useState<string | null>(null);
  const [vehicleActionSubmitting, setVehicleActionSubmitting] = useState(false);
  const [vehicleReason, setVehicleReason] = useState('');
  const vehicleImpactRequestId = useRef(0);

  const [assignmentVehicle, setAssignmentVehicle] = useState<ManagedVehicle | null>(null);
  const [assignmentDriver, setAssignmentDriver] = useState<User | null>(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);

  const operationalUsers = useMemo(
    () => users.filter((entry) => entry.accountType !== 'company_owner'),
    [users]
  );
  const drivers = useMemo(
    () => operationalUsers.filter((entry) => entry.role === 'driver'),
    [operationalUsers]
  );
  const canOpenDocuments = canManageMobileDocuments(user);
  const canManageUsers = canManageMobileUsers(user);
  const canManageVehicles = canManageMobileVehicles(user);
  const liveVehicles = useMemo(() => mapData?.vehicles || [], [mapData?.vehicles]);
  const vehicleById = useMemo(() => {
    const entries = new Map<string, Vehicle>();
    liveVehicles.forEach((vehicle) => entries.set(vehicle.id, vehicle));
    managedVehicles.forEach((vehicle) => entries.set(vehicle.id, vehicle));
    return entries;
  }, [liveVehicles, managedVehicles]);
  const userById = useMemo(() => new Map(users.map((entry) => [entry.id, entry])), [users]);

  const refreshDirectory = useCallback(async () => {
    if (!user) return;
    setIsRefreshing(true);
    setVehiclesLoading(true);
    try {
      const [, nextVehicles] = await Promise.all([
        loadUsers(),
        getManagedVehiclesRequest(canManageMobileVehicles(user)),
      ]);
      setManagedVehicles(nextVehicles);
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible actualizar el directorio.'));
    } finally {
      setIsRefreshing(false);
      setVehiclesLoading(false);
    }
  }, [loadUsers, user]);

  useEffect(() => {
    if (user) void refreshDirectory();
  }, [refreshDirectory, user]);

  useEffect(() => () => {
    driverImpactRequestId.current += 1;
    vehicleImpactRequestId.current += 1;
  }, []);

  const openDocuments = async (ownerType: 'driver' | 'vehicle', ownerId: string, name: string) => {
    setDocumentsOwner({ id: ownerId, name, ownerType });
    setDocuments([]);
    setDocumentsLoading(true);
    setMessage(null);
    try {
      setDocuments(await getAdminDocumentsForOwnerRequest(ownerType, ownerId));
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible cargar los documentos.'));
    } finally {
      setDocumentsLoading(false);
    }
  };

  const openDocumentFile = async (document: DocumentItem) => {
    if (!token || !document.storageKey) {
      setMessage('El archivo protegido no está disponible.');
      return;
    }
    try {
      setOpeningDocumentId(document.id);
      await openAuthenticatedDocument({
        storageKey: document.storageKey,
        token,
        fileName: document.originalFileName || document.name,
        mimeType: document.mimeType || 'application/octet-stream',
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible abrir el documento.');
    } finally {
      setOpeningDocumentId(null);
    }
  };

  const loadDriverImpact = async (target: User) => {
    const requestId = ++driverImpactRequestId.current;
    setDriverImpact(null);
    setDriverImpactError(null);
    setDriverImpactLoading(true);
    try {
      const impact = await getDriverLifecycleImpactRequest(target.id);
      if (requestId !== driverImpactRequestId.current) return;
      setDriverImpact(impact);
    } catch (error) {
      if (requestId !== driverImpactRequestId.current) return;
      setDriverImpactError(getApiErrorMessage(error, 'No fue posible revisar el impacto de la acción.'));
    } finally {
      if (requestId === driverImpactRequestId.current) setDriverImpactLoading(false);
    }
  };

  const openDriverAction = (kind: DriverActionKind, target: User) => {
    setDriverAction({ kind, target });
    setDriverReason('');
    setDriverConfirmation('');
    setMessage(null);
    void loadDriverImpact(target);
  };

  const closeDriverAction = () => {
    if (driverActionSubmitting) return;
    driverImpactRequestId.current += 1;
    setDriverAction(null);
    setDriverImpact(null);
    setDriverImpactError(null);
    setDriverReason('');
    setDriverConfirmation('');
  };

  const executeDriverAction = async () => {
    if (!driverAction || !driverImpact) return;
    const canConfirm = canConfirmDirectoryDriverAction({
      kind: driverAction.kind,
      impactLoading: driverImpactLoading,
      impactReady: Boolean(driverImpact),
      submitting: driverActionSubmitting,
      canOffboard: driverImpact.canOffboard,
      canDelete: driverImpact.canDelete,
      reason: driverReason,
      confirmation: driverConfirmation,
    });
    if (!canConfirm) return;

    setDriverActionSubmitting(true);
    setMessage(null);
    try {
      if (driverAction.kind === 'offboard') {
        await offboardDriverRequest(driverAction.target.id, driverReason.trim());
        setMessage('Conductor dado de baja. La unidad y el cupo del plan quedaron disponibles.');
      } else if (driverAction.kind === 'reactivate') {
        await reactivateDriverRequest(driverAction.target.id);
        setMessage('Conductor reactivado. Puedes asignarle una unidad disponible desde Directorio.');
      } else {
        await deleteDriverRequest(
          driverAction.target.id,
          driverReason.trim(),
          driverConfirmation.trim().toUpperCase()
        );
        setMessage('Conductor eliminado de forma segura. El historial operativo se conservó.');
      }
      setDriverAction(null);
      setDriverImpact(null);
      setDriverImpactError(null);
      setDriverReason('');
      setDriverConfirmation('');
      setDriverActionSubmitting(false);
      await refreshDirectory();
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible completar la acción sobre el conductor.'));
      setDriverActionSubmitting(false);
      await loadDriverImpact(driverAction.target);
    }
  };

  const openVehicleEditor = (vehicle?: ManagedVehicle) => {
    setVehicleEditor(vehicle || 'new');
    setVehicleDraft(
      vehicle
        ? {
            code: vehicle.code || '',
            plate: vehicle.plate || '',
            status: vehicle.status === 'maintenance' ? 'maintenance' : 'available',
            currentKilometers: typeof vehicle.currentKilometers === 'number' ? String(vehicle.currentKilometers) : '',
          }
        : createEmptyVehicleDraft()
    );
    setMessage(null);
  };

  const saveVehicle = async () => {
    if (!vehicleEditor) return;
    const code = vehicleDraft.code.trim();
    const plate = vehicleDraft.plate.trim().toUpperCase();
    if (!code || !plate) {
      setMessage('Nombre y placas de la unidad son obligatorios.');
      return;
    }
    const kilometers = vehicleDraft.currentKilometers.trim();
    const currentKilometers = kilometers ? Number(kilometers) : undefined;
    if (typeof currentKilometers === 'number' && (!Number.isFinite(currentKilometers) || currentKilometers < 0)) {
      setMessage('El kilometraje debe ser un número válido.');
      return;
    }

    setVehicleSaving(true);
    try {
      const payload = {
        code,
        plate,
        status: vehicleDraft.status,
        ...(typeof currentKilometers === 'number' ? { currentKilometers } : {}),
      };
      if (vehicleEditor === 'new') {
        await createManagedVehicleRequest(payload);
        setMessage('Unidad creada correctamente.');
      } else {
        await updateManagedVehicleRequest(vehicleEditor.id, payload);
        setMessage('Unidad actualizada correctamente.');
      }
      setVehicleEditor(null);
      setVehicleSaving(false);
      await refreshDirectory();
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible guardar la unidad.'));
      setVehicleSaving(false);
    }
  };

  const loadVehicleImpact = async (target: ManagedVehicle) => {
    const requestId = ++vehicleImpactRequestId.current;
    setVehicleImpact(null);
    setVehicleImpactError(null);
    setVehicleImpactLoading(true);
    try {
      const impact = await getVehicleDeletionImpactRequest(target.id);
      if (requestId !== vehicleImpactRequestId.current) return;
      setVehicleImpact(impact);
    } catch (error) {
      if (requestId !== vehicleImpactRequestId.current) return;
      setVehicleImpactError(getApiErrorMessage(error, 'No fue posible revisar las dependencias de la unidad.'));
    } finally {
      if (requestId === vehicleImpactRequestId.current) setVehicleImpactLoading(false);
    }
  };

  const openVehicleAction = (kind: VehicleActionKind, target: ManagedVehicle) => {
    setVehicleAction({ kind, target });
    setVehicleReason('');
    setMessage(null);
    void loadVehicleImpact(target);
  };

  const closeVehicleAction = () => {
    if (vehicleActionSubmitting) return;
    vehicleImpactRequestId.current += 1;
    setVehicleAction(null);
    setVehicleImpact(null);
    setVehicleImpactError(null);
    setVehicleReason('');
  };

  const executeVehicleAction = async () => {
    if (!vehicleAction || !vehicleImpact) return;
    const canConfirm = canConfirmDirectoryVehicleAction({
      kind: vehicleAction.kind,
      impactLoading: vehicleImpactLoading,
      impactReady: Boolean(vehicleImpact),
      submitting: vehicleActionSubmitting,
      canRetire: vehicleImpact.canRetire,
      canDeletePermanently: vehicleImpact.canDeletePermanently,
      reason: vehicleReason,
    });
    if (!canConfirm) return;

    setVehicleActionSubmitting(true);
    setMessage(null);
    try {
      if (vehicleAction.kind === 'retire') {
        await retireVehicleRequest(vehicleAction.target.id, vehicleReason.trim());
        setMessage('Unidad dada de baja. Su historial permanece disponible.');
      } else {
        await deleteManagedVehicleRequest(vehicleAction.target.id);
        setMessage('Unidad sin historial eliminada correctamente.');
      }
      setVehicleAction(null);
      setVehicleImpact(null);
      setVehicleImpactError(null);
      setVehicleReason('');
      setVehicleActionSubmitting(false);
      await refreshDirectory();
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible completar la acción sobre la unidad.'));
      setVehicleActionSubmitting(false);
      await loadVehicleImpact(vehicleAction.target);
    }
  };

  const assignDriverToVehicle = async (driverId: string | null) => {
    if (!assignmentVehicle || !canManageUsers) return;
    setAssignmentLoading(true);
    setMessage(null);
    try {
      if (driverId === null) {
        if (!assignmentVehicle.driverId) {
          setAssignmentLoading(false);
          return;
        }
        await assignDriverVehicleRequest(assignmentVehicle.driverId, null);
        setMessage('Conductor liberado. La unidad quedó disponible.');
      } else {
        await assignDriverVehicleRequest(driverId, assignmentVehicle.id);
        setMessage('Conductor asignado a la unidad.');
      }
      setAssignmentVehicle(null);
      setAssignmentLoading(false);
      await refreshDirectory();
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible actualizar la asignación.'));
      setAssignmentLoading(false);
    }
  };

  const assignVehicleToDriver = async (vehicleId: string | null) => {
    if (!assignmentDriver || !canManageUsers) return;
    setAssignmentLoading(true);
    setMessage(null);
    try {
      await assignDriverVehicleRequest(assignmentDriver.id, vehicleId);
      setMessage(
        vehicleId
          ? 'Unidad asignada al conductor.'
          : 'Unidad liberada. El conductor continúa activo sin unidad.'
      );
      setAssignmentDriver(null);
      setAssignmentLoading(false);
      await refreshDirectory();
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible actualizar la unidad del conductor.'));
      setAssignmentLoading(false);
    }
  };

  const driverConfirmEnabled = driverAction
    ? canConfirmDirectoryDriverAction({
        kind: driverAction.kind,
        impactLoading: driverImpactLoading,
        impactReady: Boolean(driverImpact),
        submitting: driverActionSubmitting,
        canOffboard: driverImpact?.canOffboard,
        canDelete: driverImpact?.canDelete,
        reason: driverReason,
        confirmation: driverConfirmation,
      })
    : false;

  const vehicleConfirmEnabled = vehicleAction
    ? canConfirmDirectoryVehicleAction({
        kind: vehicleAction.kind,
        impactLoading: vehicleImpactLoading,
        impactReady: Boolean(vehicleImpact),
        submitting: vehicleActionSubmitting,
        canRetire: vehicleImpact?.canRetire,
        canDeletePermanently: vehicleImpact?.canDeletePermanently,
        reason: vehicleReason,
      })
    : false;

  if (!user) {
    return (
      <AppShell sectionKey="usuarios">
        <AppCard>
          <Text style={styles.title}>Acceso restringido</Text>
          <Text style={styles.subtitle}>Inicia sesión para consultar el directorio operativo.</Text>
        </AppCard>
      </AppShell>
    );
  }

  return (
    <AppShell
      scroll
      sectionKey="usuarios"
      mobileTitle="Directorio"
      onRefresh={refreshDirectory}
      refreshing={isRefreshing}
      header={
        <View style={styles.header}>
          <Text style={styles.title}>Directorio</Text>
          <Text style={styles.subtitle}>Personal registrado y unidades de la empresa. El conductor conserva la edición de su perfil; administración controla la operación.</Text>
        </View>
      }>
      <View style={styles.tabs}>
        <Pressable onPress={() => setActiveTab('personal')} style={[styles.tab, activeTab === 'personal' ? styles.tabActive : undefined]}>
          <MaterialCommunityIcons name="account-group-outline" size={18} color={activeTab === 'personal' ? theme.colors.accent : theme.colors.muted} />
          <Text style={[styles.tabText, activeTab === 'personal' ? styles.tabTextActive : undefined]}>Personal</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('vehicles')} style={[styles.tab, activeTab === 'vehicles' ? styles.tabActive : undefined]}>
          <MaterialCommunityIcons name="bus-multiple" size={18} color={activeTab === 'vehicles' ? theme.colors.accent : theme.colors.muted} />
          <Text style={[styles.tabText, activeTab === 'vehicles' ? styles.tabTextActive : undefined]}>Unidades</Text>
        </Pressable>
      </View>

      {message ? <View style={styles.messageBox}><Text style={styles.messageText}>{message}</Text></View> : null}

      {activeTab === 'personal' ? (
        <AppCard style={styles.directoryCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Personal operativo</Text>
              <Text style={styles.sectionSubtitle}>{operationalUsers.length} usuarios · el conductor edita su propio perfil</Text>
            </View>
          </View>

          <View style={styles.usersList}>
            {operationalUsers.length ? (
              operationalUsers.map((entry) => {
                const vehicle = entry.vehicleId ? vehicleById.get(entry.vehicleId) : undefined;
                const presence = getPresenceStatus(presenceByUser, entry.id);
                const isExpanded = expandedUserId === entry.id;
                const scheduleState = getOperationalScheduleState(entry.operationalSchedule);
                const scheduleLabel = formatOperationalSchedule(entry.operationalSchedule);
                const isDriver = entry.role === 'driver';
                const isSuspended = entry.userStatus === 'suspended';

                return (
                  <View key={entry.id} style={styles.userRow}>
                    <View style={styles.userTop}>
                      <UserAvatar user={entry} status={presence} showStatus size={56} />
                      <View style={styles.userMeta}>
                        <Text style={styles.userName} numberOfLines={2}>{entry.name}</Text>
                        <Text style={styles.userEmail} numberOfLines={1}>{entry.email}</Text>
                        <View style={styles.pillsRow}>
                          <StatusPill label={formatRole(entry.role)} tone={roleTone(entry.role)} />
                          <StatusPill label={formatAccountStatus(entry.userStatus, entry.role)} tone={accountStatusTone(entry.userStatus)} />
                          <PresenceBadge status={presence} />
                        </View>
                      </View>
                    </View>

                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryText}>Unidad: {vehicle?.code || 'Sin unidad'}</Text>
                      <Text style={styles.summaryText}>Tel: {entry.phone || 'Sin teléfono'}</Text>
                      {isDriver ? <Text style={styles.summaryText}>Horario: {scheduleLabel}</Text> : null}
                    </View>

                    <View style={styles.actionRow}>
                      <ActionButton
                        icon={isExpanded ? 'chevron-up' : 'account-details-outline'}
                        label={isExpanded ? 'Ocultar perfil' : 'Ver perfil'}
                        onPress={() => setExpandedUserId(isExpanded ? null : entry.id)}
                      />
                      {canManageUsers && isDriver ? (
                        <ActionButton
                          accent
                          icon="calendar-clock"
                          label="Horario"
                          onPress={() => setScheduleDriver(entry)}
                        />
                      ) : null}
                      {canManageUsers && isDriver && !isSuspended ? (
                        <ActionButton
                          icon="bus-marker"
                          label={entry.vehicleId ? 'Cambiar unidad' : 'Asignar unidad'}
                          onPress={() => setAssignmentDriver(entry)}
                        />
                      ) : null}
                      {canManageUsers && isDriver && !isSuspended ? (
                        <ActionButton
                          danger
                          icon="account-off-outline"
                          label="Dar de baja"
                          onPress={() => openDriverAction('offboard', entry)}
                        />
                      ) : null}
                      {canManageUsers && isDriver && isSuspended ? (
                        <>
                          <ActionButton
                            accent
                            icon="account-check-outline"
                            label="Reactivar"
                            onPress={() => openDriverAction('reactivate', entry)}
                          />
                          <ActionButton
                            danger
                            icon="account-remove-outline"
                            label="Eliminar"
                            onPress={() => openDriverAction('delete', entry)}
                          />
                        </>
                      ) : null}
                      {canOpenDocuments && isDriver ? (
                        <ActionButton
                          accent
                          icon="file-document-multiple-outline"
                          label="Documentos"
                          onPress={() => void openDocuments('driver', entry.id, entry.name)}
                        />
                      ) : null}
                    </View>

                    {isExpanded ? (
                      <View style={styles.profileDetail}>
                        <View style={styles.detailsGrid}>
                          <DetailItem label="Correo" value={entry.email || 'Sin correo'} />
                          <DetailItem label="Teléfono" value={entry.phone || 'Sin teléfono'} />
                          <DetailItem label="Turno" value={entry.shift || 'Sin turno'} />
                          {isDriver ? <DetailItem label="Horario" value={`${scheduleLabel} · ${scheduleState.label}`} /> : null}
                          <DetailItem label="Unidad" value={vehicle?.code || 'Sin unidad asignada'} />
                          <DetailItem label="Placas" value={vehicle?.plate || 'Sin placas'} />
                          <DetailItem label="Ruta" value={getVehicleRoute(vehicle)} />
                          <DetailItem label="Último acceso" value={formatDateTime(entry.lastAccessAt)} />
                          {entry.suspendedAt ? <DetailItem label="Baja desde" value={formatDateTime(entry.suspendedAt)} /> : null}
                        </View>
                        {isDriver ? (
                          <Text style={styles.profileNote}>El conductor mantiene sus datos personales y documentos. Administración consulta, asigna unidad, configura horario y aplica el ciclo de baja/reactivación con las mismas reglas del portal.</Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="account-search-outline" size={26} color={theme.colors.muted} />
                <Text style={styles.sectionSubtitle}>No hay personal operativo disponible.</Text>
              </View>
            )}
          </View>
        </AppCard>
      ) : (
        <AppCard style={styles.directoryCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Unidades</Text>
              <Text style={styles.sectionSubtitle}>{managedVehicles.length} unidades visibles</Text>
            </View>
            {canManageVehicles ? (
              <Pressable onPress={() => openVehicleEditor()} style={styles.primaryButton}>
                <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Nueva unidad</Text>
              </Pressable>
            ) : null}
          </View>

          {vehiclesLoading ? <ActivityIndicator color={theme.colors.accent} /> : null}
          <View style={styles.usersList}>
            {!vehiclesLoading && !managedVehicles.length ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="bus-alert" size={26} color={theme.colors.muted} />
                <Text style={styles.sectionSubtitle}>No hay unidades registradas.</Text>
              </View>
            ) : null}
            {managedVehicles.map((vehicle) => {
              const driver = vehicle.driverId ? userById.get(vehicle.driverId) : undefined;
              return (
                <View key={vehicle.id} style={styles.userRow}>
                  <View style={styles.vehicleHeader}>
                    <View style={styles.vehicleIcon}>
                      <MaterialCommunityIcons name="bus" size={26} color={theme.colors.accent} />
                    </View>
                    <View style={styles.userMeta}>
                      <Text style={styles.userName}>{vehicle.code}</Text>
                      <Text style={styles.userEmail}>{vehicle.plate || 'Sin placas'}</Text>
                      <View style={styles.pillsRow}>
                        <StatusPill label={formatVehicleStatus(vehicle)} tone={vehicleStatusTone(vehicle)} />
                        {vehicle.assignedRoute || vehicle.routeId ? <StatusPill label="Ruta asignada" tone="info" /> : null}
                      </View>
                    </View>
                  </View>
                  <View style={styles.detailsGrid}>
                    <DetailItem label="Conductor" value={driver?.name || vehicle.driverName || 'Sin conductor'} />
                    <DetailItem label="Ruta" value={getVehicleRoute(vehicle)} />
                    <DetailItem label="Kilometraje" value={typeof vehicle.currentKilometers === 'number' ? `${vehicle.currentKilometers.toLocaleString('es-MX')} km` : 'Sin registro'} />
                    <DetailItem label="Actualizada" value={formatDateTime(vehicle.updatedAt)} />
                  </View>
                  {vehicle.retiredAt ? <Text style={styles.profileNote}>Retirada: {formatDateTime(vehicle.retiredAt)}{vehicle.retirementReason ? ` · ${vehicle.retirementReason}` : ''}</Text> : null}
                  <View style={styles.actionRow}>
                    {canManageVehicles && !vehicle.retiredAt ? (
                      <>
                        <ActionButton icon="pencil-outline" label="Editar" onPress={() => openVehicleEditor(vehicle)} />
                        {canManageUsers ? (
                          <ActionButton icon="account-switch-outline" label={vehicle.driverId ? 'Conductor' : 'Asignar conductor'} onPress={() => setAssignmentVehicle(vehicle)} />
                        ) : null}
                        <ActionButton danger icon="archive-arrow-down-outline" label="Dar de baja" onPress={() => openVehicleAction('retire', vehicle)} />
                      </>
                    ) : null}
                    {canOpenDocuments ? (
                      <ActionButton accent icon="file-document-multiple-outline" label="Documentos" onPress={() => void openDocuments('vehicle', vehicle.id, vehicle.code)} />
                    ) : null}
                    {canManageVehicles ? (
                      <ActionButton danger icon="delete-outline" label="Eliminar" onPress={() => openVehicleAction('delete', vehicle)} />
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </AppCard>
      )}

      <DriverScheduleModal
        driver={scheduleDriver}
        onClose={() => setScheduleDriver(null)}
        onSaved={async () => {
          setMessage('Horario del conductor actualizado correctamente.');
          await refreshDirectory();
        }}
      />

      <Modal visible={Boolean(documentsOwner)} transparent animationType="fade" onRequestClose={() => setDocumentsOwner(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalLarge}>
            <View style={styles.modalHeader}>
              <View style={styles.sectionCopy}>
                <Text style={styles.modalTitle}>Documentos · {documentsOwner?.name}</Text>
                <Text style={styles.sectionSubtitle}>Consulta protegida dentro de ManeComb.</Text>
              </View>
              <Pressable onPress={() => setDocumentsOwner(null)} style={styles.iconButton}>
                <MaterialCommunityIcons name="close" size={22} color={theme.colors.text} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              {documentsLoading ? <ActivityIndicator color={theme.colors.accent} /> : null}
              {!documentsLoading && !documents.length ? <Text style={styles.sectionSubtitle}>No hay documentos registrados para este elemento.</Text> : null}
              {documents.map((document) => {
                const status = getDocumentStatus(document);
                return (
                  <View key={document.id} style={styles.documentRow}>
                    <View style={styles.sectionCopy}>
                      <Text style={styles.documentTitle}>{document.name}</Text>
                      <Text style={styles.sectionSubtitle}>{document.originalFileName || 'Archivo protegido'}</Text>
                      <Text style={styles.sectionSubtitle}>Vence {document.expiresAt ? new Date(document.expiresAt).toLocaleDateString('es-MX') : 'sin fecha'}</Text>
                    </View>
                    <StatusPill label={status.label} tone={status.tone} />
                    <Pressable disabled={openingDocumentId === document.id} onPress={() => void openDocumentFile(document)} style={styles.secondaryButton}>
                      {openingDocumentId === document.id ? <ActivityIndicator color={theme.colors.accent} /> : <Text style={styles.secondaryButtonText}>Ver documento</Text>}
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(driverAction)} transparent animationType="fade" onRequestClose={closeDriverAction}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{driverActionTitle(driverAction?.kind)}</Text>
            <Text style={styles.sectionSubtitle}>{driverAction?.target.name}</Text>

            {driverImpactLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.colors.accent} />
                <Text style={styles.sectionSubtitle}>Revisando jornada, unidad, documentos y dependencias…</Text>
              </View>
            ) : null}

            {driverImpactError ? (
              <View style={styles.impactErrorBox}>
                <Text style={styles.dangerText}>{driverImpactError}</Text>
                <Pressable disabled={driverImpactLoading} onPress={() => driverAction && void loadDriverImpact(driverAction.target)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Reintentar revisión</Text>
                </Pressable>
              </View>
            ) : null}

            {driverImpact ? (
              <View style={styles.impactBox}>
                {driverImpact.blockers.map((entry) => <Text key={entry} style={styles.dangerText}>• {entry}</Text>)}
                {driverImpact.warnings.map((entry) => <Text key={entry} style={styles.sectionSubtitle}>• {entry}</Text>)}
                <Text style={styles.sectionSubtitle}>Unidad actual: {driverImpact.assignedVehicle?.code || 'Sin unidad'}</Text>
                <Text style={styles.sectionSubtitle}>Sesiones a revocar: {driverImpact.sessionsToRevoke || 0}</Text>
                <Text style={styles.sectionSubtitle}>Documentos relacionados: {driverImpact.relatedDocuments?.count || 0}</Text>
              </View>
            ) : null}

            {driverAction?.kind !== 'reactivate' ? (
              <>
                <Text style={styles.inputLabel}>Motivo</Text>
                <TextInput
                  value={driverReason}
                  onChangeText={setDriverReason}
                  editable={!driverActionSubmitting}
                  multiline
                  placeholder="Ej. baja administrativa"
                  placeholderTextColor={theme.colors.muted}
                  style={[styles.input, styles.textArea]}
                />
              </>
            ) : null}

            {driverAction?.kind === 'delete' ? (
              <>
                <Text style={styles.dangerText}>La eliminación definitiva solo procede después de la baja, sin unidad ni jornada activa. El historial operativo se conserva.</Text>
                <Text style={styles.inputLabel}>Escribe ELIMINAR para confirmar</Text>
                <TextInput
                  value={driverConfirmation}
                  onChangeText={setDriverConfirmation}
                  editable={!driverActionSubmitting}
                  autoCapitalize="characters"
                  placeholder="ELIMINAR"
                  placeholderTextColor={theme.colors.muted}
                  style={styles.input}
                />
              </>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable disabled={driverActionSubmitting} onPress={closeDriverAction} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable
                disabled={!driverConfirmEnabled}
                onPress={() => void executeDriverAction()}
                style={[
                  styles.primaryButton,
                  driverAction?.kind === 'delete' || driverAction?.kind === 'offboard' ? styles.dangerButton : undefined,
                  !driverConfirmEnabled ? styles.disabledButton : undefined,
                ]}>
                {driverActionSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{driverActionConfirmLabel(driverAction?.kind)}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(vehicleEditor)} transparent animationType="fade" onRequestClose={() => !vehicleSaving && setVehicleEditor(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{vehicleEditor === 'new' ? 'Nueva unidad' : 'Editar unidad'}</Text>
            <Text style={styles.inputLabel}>Nombre / número económico</Text>
            <TextInput value={vehicleDraft.code} onChangeText={(code) => setVehicleDraft((current) => ({ ...current, code }))} placeholder="C-1" placeholderTextColor={theme.colors.muted} style={styles.input} />
            <Text style={styles.inputLabel}>Placas</Text>
            <TextInput value={vehicleDraft.plate} onChangeText={(plate) => setVehicleDraft((current) => ({ ...current, plate }))} autoCapitalize="characters" placeholder="ABC-123-A" placeholderTextColor={theme.colors.muted} style={styles.input} />
            <Text style={styles.inputLabel}>Kilometraje actual</Text>
            <TextInput value={vehicleDraft.currentKilometers} onChangeText={(currentKilometers) => setVehicleDraft((current) => ({ ...current, currentKilometers }))} keyboardType="numeric" placeholder="0" placeholderTextColor={theme.colors.muted} style={styles.input} />
            <Text style={styles.inputLabel}>Estatus</Text>
            <View style={styles.segmentRow}>
              {(['available', 'maintenance'] as const).map((status) => (
                <Pressable key={status} onPress={() => setVehicleDraft((current) => ({ ...current, status }))} style={[styles.segment, vehicleDraft.status === status ? styles.segmentActive : undefined]}>
                  <Text style={[styles.segmentText, vehicleDraft.status === status ? styles.segmentTextActive : undefined]}>{status === 'available' ? 'Disponible' : 'Mantenimiento'}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.profileNote}>Los estados de ruta o jornada se derivan de la operación; aquí solo se administra disponibilidad o mantenimiento.</Text>
            <View style={styles.modalActions}>
              <Pressable disabled={vehicleSaving} onPress={() => setVehicleEditor(null)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancelar</Text></Pressable>
              <Pressable disabled={vehicleSaving} onPress={() => void saveVehicle()} style={styles.primaryButton}>{vehicleSaving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Guardar</Text>}</Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(vehicleAction)} transparent animationType="fade" onRequestClose={closeVehicleAction}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{vehicleAction?.kind === 'retire' ? 'Dar de baja la unidad' : 'Eliminar unidad'}</Text>
            <Text style={styles.sectionSubtitle}>{vehicleAction?.target.code} · {vehicleAction?.target.plate}</Text>

            {vehicleImpactLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.colors.accent} />
                <Text style={styles.sectionSubtitle}>Revisando conductor, ruta, jornada e historial…</Text>
              </View>
            ) : null}

            {vehicleImpactError ? (
              <View style={styles.impactErrorBox}>
                <Text style={styles.dangerText}>{vehicleImpactError}</Text>
                <Pressable disabled={vehicleImpactLoading} onPress={() => vehicleAction && void loadVehicleImpact(vehicleAction.target)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Reintentar revisión</Text>
                </Pressable>
              </View>
            ) : null}

            {vehicleImpact ? (
              <View style={styles.impactBox}>
                {vehicleImpact.blockers.map((entry) => <Text key={entry} style={styles.dangerText}>• {entry}</Text>)}
                {vehicleImpact.actionsRequired.map((entry) => <Text key={entry} style={styles.sectionSubtitle}>• Requiere: {entry}</Text>)}
                <Text style={styles.sectionSubtitle}>Historial: {vehicleImpact.history?.total || 0} registros · Documentos: {vehicleImpact.documents?.count || 0}</Text>
                {vehicleAction?.kind === 'delete' && vehicleImpact.mustRetire ? <Text style={styles.dangerText}>Esta unidad conserva historial; debe darse de baja en lugar de eliminarse.</Text> : null}
              </View>
            ) : null}

            {vehicleAction?.kind === 'retire' ? (
              <>
                <Text style={styles.inputLabel}>Motivo</Text>
                <TextInput value={vehicleReason} onChangeText={setVehicleReason} editable={!vehicleActionSubmitting} multiline placeholder="Ej. fin de vida útil" placeholderTextColor={theme.colors.muted} style={[styles.input, styles.textArea]} />
              </>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable disabled={vehicleActionSubmitting} onPress={closeVehicleAction} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancelar</Text></Pressable>
              <Pressable
                disabled={!vehicleConfirmEnabled}
                onPress={() => void executeVehicleAction()}
                style={[styles.primaryButton, styles.dangerButton, !vehicleConfirmEnabled ? styles.disabledButton : undefined]}>
                {vehicleActionSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{vehicleAction?.kind === 'retire' ? 'Dar de baja' : 'Eliminar'}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(assignmentDriver)} transparent animationType="fade" onRequestClose={() => !assignmentLoading && setAssignmentDriver(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalLarge}>
            <View style={styles.modalHeader}>
              <View style={styles.sectionCopy}>
                <Text style={styles.modalTitle}>Unidad · {assignmentDriver?.name}</Text>
                <Text style={styles.sectionSubtitle}>Misma transición operativa del portal de Ventas: el conductor puede quedar activo sin unidad o cambiar a una disponible.</Text>
              </View>
              <Pressable disabled={assignmentLoading} onPress={() => setAssignmentDriver(null)} style={styles.iconButton}><MaterialCommunityIcons name="close" size={22} color={theme.colors.text} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <Pressable disabled={assignmentLoading || !assignmentDriver?.vehicleId} onPress={() => void assignVehicleToDriver(null)} style={[styles.driverChoice, assignmentDriver?.vehicleId ? styles.dangerChoice : styles.selectedChoice]}>
                <MaterialCommunityIcons name="bus-stop-uncovered" size={20} color={assignmentDriver?.vehicleId ? theme.colors.danger : theme.colors.accent} />
                <View style={styles.sectionCopy}>
                  <Text style={styles.documentTitle}>Sin unidad</Text>
                  <Text style={styles.sectionSubtitle}>{assignmentDriver?.vehicleId ? 'Liberar la unidad actual y mantener la cuenta activa.' : 'Estado actual del conductor.'}</Text>
                </View>
              </Pressable>

              {managedVehicles
                .filter((vehicle) => !vehicle.retiredAt && vehicle.status === 'available' && (!vehicle.driverId || vehicle.id === assignmentDriver?.vehicleId))
                .map((vehicle) => {
                  const isCurrent = vehicle.id === assignmentDriver?.vehicleId;
                  return (
                    <Pressable key={vehicle.id} disabled={assignmentLoading || isCurrent} onPress={() => void assignVehicleToDriver(vehicle.id)} style={[styles.driverChoice, isCurrent ? styles.selectedChoice : undefined]}>
                      <MaterialCommunityIcons name="bus" size={20} color={isCurrent ? theme.colors.accent : theme.colors.text} />
                      <View style={styles.sectionCopy}>
                        <Text style={styles.documentTitle}>{vehicle.code} · {vehicle.plate || 'Sin placas'}</Text>
                        <Text style={styles.sectionSubtitle}>{isCurrent ? 'Unidad actual' : getVehicleRoute(vehicle)}</Text>
                      </View>
                      {isCurrent ? <StatusPill label="Actual" tone="positive" /> : <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.muted} />}
                    </Pressable>
                  );
                })}

              {!managedVehicles.some((vehicle) => !vehicle.retiredAt && vehicle.status === 'available' && !vehicle.driverId) && !assignmentDriver?.vehicleId ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="bus-alert" size={24} color={theme.colors.muted} />
                  <Text style={styles.sectionSubtitle}>No hay unidades disponibles en este momento.</Text>
                </View>
              ) : null}
              {assignmentLoading ? <ActivityIndicator color={theme.colors.accent} /> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(assignmentVehicle)} transparent animationType="fade" onRequestClose={() => !assignmentLoading && setAssignmentVehicle(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalLarge}>
            <View style={styles.modalHeader}>
              <View style={styles.sectionCopy}>
                <Text style={styles.modalTitle}>Conductor · {assignmentVehicle?.code}</Text>
                <Text style={styles.sectionSubtitle}>{assignmentVehicle?.driverId ? 'Libera primero al conductor actual antes de reasignar.' : 'Selecciona un conductor activo.'}</Text>
              </View>
              <Pressable disabled={assignmentLoading} onPress={() => setAssignmentVehicle(null)} style={styles.iconButton}><MaterialCommunityIcons name="close" size={22} color={theme.colors.text} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              {assignmentVehicle?.driverId ? (
                <Pressable disabled={assignmentLoading} onPress={() => void assignDriverToVehicle(null)} style={[styles.driverChoice, styles.dangerChoice]}>
                  <MaterialCommunityIcons name="account-minus-outline" size={20} color={theme.colors.danger} />
                  <View style={styles.sectionCopy}>
                    <Text style={styles.documentTitle}>Liberar {userById.get(assignmentVehicle.driverId)?.name || 'conductor actual'}</Text>
                    <Text style={styles.sectionSubtitle}>La unidad quedará disponible para otra asignación.</Text>
                  </View>
                </Pressable>
              ) : (
                drivers.filter((driver) => driver.userStatus !== 'suspended').map((driver) => {
                  const currentVehicle = driver.vehicleId ? vehicleById.get(driver.vehicleId) : undefined;
                  return (
                    <Pressable key={driver.id} disabled={assignmentLoading} onPress={() => void assignDriverToVehicle(driver.id)} style={styles.driverChoice}>
                      <UserAvatar user={driver} size={42} />
                      <View style={styles.sectionCopy}>
                        <Text style={styles.documentTitle}>{driver.name}</Text>
                        <Text style={styles.sectionSubtitle}>{currentVehicle ? `Actualmente: ${currentVehicle.code}` : 'Sin unidad asignada'}</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.muted} />
                    </Pressable>
                  );
                })
              )}
              {assignmentLoading ? <ActivityIndicator color={theme.colors.accent} /> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </AppShell>
  );

  function ActionButton({
    accent = false,
    danger = false,
    icon,
    label,
    onPress,
  }: {
    accent?: boolean;
    danger?: boolean;
    icon: string;
    label: string;
    onPress: () => void;
  }) {
    const color = danger ? theme.colors.danger : accent ? theme.colors.accent : theme.colors.text;
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.actionButton, pressed ? styles.actionButtonPressed : undefined]}>
        <MaterialCommunityIcons name={icon} size={18} color={color} />
        <Text style={[styles.actionText, { color }]}>{label}</Text>
      </Pressable>
    );
  }
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

function createStyles(theme: ReturnType<typeof useAppTheme>['theme'], isPhone = false) {
  return StyleSheet.create({
    header: { gap: 8, maxWidth: 760, paddingTop: isPhone ? AppTheme.spacing.sm : AppTheme.spacing.md },
    title: { color: theme.colors.text, fontFamily: Typography.display, fontSize: isPhone ? 24 : 30, fontWeight: '900' },
    subtitle: { color: theme.colors.muted, fontFamily: Typography.body, fontSize: isPhone ? 13 : 14, lineHeight: isPhone ? 20 : 21 },
    tabs: { flexDirection: 'row', gap: 8 },
    tab: { alignItems: 'center', backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.line, borderRadius: AppTheme.radius.md, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 11 },
    tabActive: { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent },
    tabText: { color: theme.colors.muted, fontFamily: Typography.body, fontSize: 13, fontWeight: '800' },
    tabTextActive: { color: theme.colors.accent },
    messageBox: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.line, borderRadius: AppTheme.radius.md, borderWidth: 1, padding: 12 },
    messageText: { color: theme.colors.text, fontFamily: Typography.body, fontSize: 13, lineHeight: 19 },
    directoryCard: { width: '100%' },
    sectionHeader: { alignItems: isPhone ? 'stretch' : 'center', flexDirection: isPhone ? 'column' : 'row', gap: 12, justifyContent: 'space-between' },
    sectionCopy: { flex: 1, gap: 6, minWidth: 0 },
    sectionTitle: { color: theme.colors.text, fontFamily: Typography.display, fontSize: 20, fontWeight: '900' },
    sectionSubtitle: { color: theme.colors.muted, fontFamily: Typography.body, fontSize: isPhone ? 13 : 14, lineHeight: isPhone ? 20 : 22 },
    usersList: { gap: AppTheme.spacing.md },
    userRow: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.line, borderRadius: AppTheme.radius.md, borderWidth: 1, gap: isPhone ? 10 : 12, padding: isPhone ? AppTheme.spacing.sm : AppTheme.spacing.md },
    userTop: { alignItems: 'flex-start', flexDirection: isPhone ? 'column' : 'row', gap: 12 },
    userMeta: { flex: 1, gap: 6, minWidth: 0 },
    userName: { color: theme.colors.text, fontFamily: Typography.display, fontSize: isPhone ? 17 : 19, fontWeight: '900' },
    userEmail: { color: theme.colors.muted, fontFamily: Typography.body, fontSize: isPhone ? 13 : 14 },
    pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    summaryText: { color: theme.colors.muted, fontFamily: Typography.body, fontSize: 12, fontWeight: '700' },
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    actionButton: { alignItems: 'center', backgroundColor: theme.colors.card, borderColor: theme.colors.line, borderRadius: AppTheme.radius.md, borderWidth: 1, flexDirection: 'row', gap: 7, paddingHorizontal: 12, paddingVertical: 9 },
    actionButtonPressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
    actionText: { color: theme.colors.text, fontFamily: Typography.body, fontSize: 12, fontWeight: '800' },
    profileDetail: { borderTopColor: theme.colors.line, borderTopWidth: 1, gap: 10, paddingTop: 12 },
    detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    detailItem: { backgroundColor: theme.colors.card, borderRadius: AppTheme.radius.md, flex: 1, gap: 6, minWidth: isPhone ? '100%' : 150, padding: AppTheme.spacing.sm },
    detailLabel: { color: theme.colors.muted, fontFamily: Typography.body, fontSize: 12, fontWeight: '800' },
    detailValue: { color: theme.colors.text, fontFamily: Typography.body, fontSize: isPhone ? 13 : 14, fontWeight: '800' },
    profileNote: { color: theme.colors.muted, fontFamily: Typography.body, fontSize: 12, lineHeight: 18 },
    emptyState: { alignItems: 'center', backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.line, borderRadius: AppTheme.radius.md, borderWidth: 1, gap: 10, padding: AppTheme.spacing.md },
    primaryButton: { alignItems: 'center', alignSelf: isPhone ? 'stretch' : 'auto', backgroundColor: theme.colors.accent, borderRadius: AppTheme.radius.md, flexDirection: 'row', gap: 7, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10 },
    primaryButtonText: { color: '#FFFFFF', fontFamily: Typography.body, fontSize: 13, fontWeight: '900' },
    secondaryButton: { alignItems: 'center', backgroundColor: theme.colors.card, borderColor: theme.colors.line, borderRadius: AppTheme.radius.md, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 14, paddingVertical: 9 },
    secondaryButtonText: { color: theme.colors.text, fontFamily: Typography.body, fontSize: 13, fontWeight: '800' },
    dangerButton: { backgroundColor: theme.colors.danger },
    disabledButton: { opacity: 0.45 },
    dangerText: { color: theme.colors.danger, fontFamily: Typography.body, fontSize: 12, fontWeight: '800', lineHeight: 18 },
    vehicleHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    vehicleIcon: { alignItems: 'center', backgroundColor: theme.colors.card, borderColor: theme.colors.line, borderRadius: 18, borderWidth: 1, height: 56, justifyContent: 'center', width: 56 },
    overlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.72)', flex: 1, justifyContent: 'center', padding: 18 },
    modal: { backgroundColor: theme.colors.surface, borderColor: theme.colors.line, borderRadius: AppTheme.radius.lg, borderWidth: 1, gap: 12, maxHeight: '90%', maxWidth: 560, padding: isPhone ? 16 : 20, width: '100%' },
    modalLarge: { backgroundColor: theme.colors.surface, borderColor: theme.colors.line, borderRadius: AppTheme.radius.lg, borderWidth: 1, maxHeight: '86%', maxWidth: 680, padding: isPhone ? 16 : 20, width: '100%' },
    modalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
    modalTitle: { color: theme.colors.text, fontFamily: Typography.display, fontSize: 20, fontWeight: '900' },
    modalActions: { flexDirection: isPhone ? 'column-reverse' : 'row', gap: 10, justifyContent: 'flex-end' },
    modalScroll: { gap: 10, paddingTop: 14 },
    iconButton: { alignItems: 'center', backgroundColor: theme.colors.card, borderColor: theme.colors.line, borderRadius: 20, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
    documentRow: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.line, borderRadius: AppTheme.radius.md, borderWidth: 1, gap: 10, padding: 12 },
    documentTitle: { color: theme.colors.text, fontFamily: Typography.body, fontSize: 14, fontWeight: '900' },
    impactBox: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.line, borderRadius: AppTheme.radius.md, borderWidth: 1, gap: 7, padding: 12 },
    impactErrorBox: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.danger, borderRadius: AppTheme.radius.md, borderWidth: 1, gap: 10, padding: 12 },
    loadingRow: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 40 },
    inputLabel: { color: theme.colors.text, fontFamily: Typography.body, fontSize: 12, fontWeight: '800' },
    input: { backgroundColor: theme.colors.card, borderColor: theme.colors.line, borderRadius: AppTheme.radius.md, borderWidth: 1, color: theme.colors.text, fontFamily: Typography.body, fontSize: 14, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10 },
    textArea: { minHeight: 82, textAlignVertical: 'top' },
    segmentRow: { flexDirection: 'row', gap: 8 },
    segment: { alignItems: 'center', backgroundColor: theme.colors.card, borderColor: theme.colors.line, borderRadius: AppTheme.radius.md, borderWidth: 1, flex: 1, padding: 10 },
    segmentActive: { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent },
    segmentText: { color: theme.colors.muted, fontFamily: Typography.body, fontSize: 12, fontWeight: '800' },
    segmentTextActive: { color: theme.colors.accent },
    driverChoice: { alignItems: 'center', backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.line, borderRadius: AppTheme.radius.md, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 12 },
    dangerChoice: { borderColor: theme.colors.danger },
    selectedChoice: { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent },
  });
}
