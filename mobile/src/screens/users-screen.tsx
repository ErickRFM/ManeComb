import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { DesignSystem, type DesignTone as Tone } from '@/constants/theme';
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
import { createDirectoryStyles } from './users/users-screen.styles';
import { DirectoryImpactActionModal } from './users/components/DirectoryImpactActionModal';
import { DirectorySheetModal } from './users/components/DirectorySheetModal';
import {
  canConfirmDirectoryDriverAction,
  canConfirmDirectoryVehicleAction,
  type DirectoryDriverActionKind,
  type DirectoryVehicleActionKind,
} from './users/directory-action-state';
import { useDirectoryImpactAction } from './users/use-directory-impact-action';

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
  const styles = useMemo(() => createDirectoryStyles(theme, isPhone), [theme, isPhone]);
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

  // La confirmacion escrita es propia del dominio conductor, asi que no vive en
  // la maquina compartida; se limpia con su `onReset`.
  const [driverConfirmation, setDriverConfirmation] = useState('');
  const driverFlow = useDirectoryImpactAction<DriverActionKind, User, DriverLifecycleImpact>({
    loadImpact: (target) => getDriverLifecycleImpactRequest(target.id),
    impactErrorMessage: 'No fue posible revisar el impacto de la acción.',
    onReset: () => setDriverConfirmation(''),
  });

  const [vehicleEditor, setVehicleEditor] = useState<ManagedVehicle | 'new' | null>(null);
  const [vehicleDraft, setVehicleDraft] = useState<VehicleDraft>(createEmptyVehicleDraft());
  const [vehicleSaving, setVehicleSaving] = useState(false);
  const vehicleFlow = useDirectoryImpactAction<VehicleActionKind, ManagedVehicle, VehicleDeletionImpact>({
    loadImpact: (target) => getVehicleDeletionImpactRequest(target.id),
    impactErrorMessage: 'No fue posible revisar las dependencias de la unidad.',
  });

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

  const openDriverAction = (kind: DriverActionKind, target: User) => {
    setMessage(null);
    driverFlow.open(kind, target);
  };

  const executeDriverAction = async () => {
    const { action, impact } = driverFlow;
    if (!action || !impact) return;
    const canConfirm = canConfirmDirectoryDriverAction({
      kind: action.kind,
      impactLoading: driverFlow.impactLoading,
      impactReady: Boolean(impact),
      submitting: driverFlow.submitting,
      canOffboard: impact.canOffboard,
      canDelete: impact.canDelete,
      reason: driverFlow.reason,
      confirmation: driverConfirmation,
    });
    if (!canConfirm) return;

    driverFlow.setSubmitting(true);
    setMessage(null);
    try {
      if (action.kind === 'offboard') {
        await offboardDriverRequest(action.target.id, driverFlow.reason.trim());
        setMessage('Conductor dado de baja. La unidad y el cupo del plan quedaron disponibles.');
      } else if (action.kind === 'reactivate') {
        await reactivateDriverRequest(action.target.id);
        setMessage('Conductor reactivado. Puedes asignarle una unidad disponible desde Directorio.');
      } else {
        await deleteDriverRequest(
          action.target.id,
          driverFlow.reason.trim(),
          driverConfirmation.trim().toUpperCase()
        );
        setMessage('Conductor eliminado de forma segura. El historial operativo se conservó.');
      }
      driverFlow.complete();
      await refreshDirectory();
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible completar la acción sobre el conductor.'));
      driverFlow.setSubmitting(false);
      await driverFlow.reload(action.target);
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

  const openVehicleAction = (kind: VehicleActionKind, target: ManagedVehicle) => {
    setMessage(null);
    vehicleFlow.open(kind, target);
  };

  const executeVehicleAction = async () => {
    const { action, impact } = vehicleFlow;
    if (!action || !impact) return;
    const canConfirm = canConfirmDirectoryVehicleAction({
      kind: action.kind,
      impactLoading: vehicleFlow.impactLoading,
      impactReady: Boolean(impact),
      submitting: vehicleFlow.submitting,
      canRetire: impact.canRetire,
      canDeletePermanently: impact.canDeletePermanently,
      reason: vehicleFlow.reason,
    });
    if (!canConfirm) return;

    vehicleFlow.setSubmitting(true);
    setMessage(null);
    try {
      if (action.kind === 'retire') {
        await retireVehicleRequest(action.target.id, vehicleFlow.reason.trim());
        setMessage('Unidad dada de baja. Su historial permanece disponible.');
      } else {
        await deleteManagedVehicleRequest(action.target.id);
        setMessage('Unidad sin historial eliminada correctamente.');
      }
      vehicleFlow.complete();
      await refreshDirectory();
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible completar la acción sobre la unidad.'));
      vehicleFlow.setSubmitting(false);
      await vehicleFlow.reload(action.target);
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

  const driverConfirmEnabled = driverFlow.action
    ? canConfirmDirectoryDriverAction({
        kind: driverFlow.action.kind,
        impactLoading: driverFlow.impactLoading,
        impactReady: Boolean(driverFlow.impact),
        submitting: driverFlow.submitting,
        canOffboard: driverFlow.impact?.canOffboard,
        canDelete: driverFlow.impact?.canDelete,
        reason: driverFlow.reason,
        confirmation: driverConfirmation,
      })
    : false;

  const vehicleConfirmEnabled = vehicleFlow.action
    ? canConfirmDirectoryVehicleAction({
        kind: vehicleFlow.action.kind,
        impactLoading: vehicleFlow.impactLoading,
        impactReady: Boolean(vehicleFlow.impact),
        submitting: vehicleFlow.submitting,
        canRetire: vehicleFlow.impact?.canRetire,
        canDeletePermanently: vehicleFlow.impact?.canDeletePermanently,
        reason: vehicleFlow.reason,
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

      <DirectorySheetModal
        visible={Boolean(documentsOwner)}
        title={`Documentos · ${documentsOwner?.name || ''}`}
        subtitle="Consulta protegida dentro de ManeComb."
        onClose={() => setDocumentsOwner(null)}
        styles={styles}>
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
      </DirectorySheetModal>

      <DirectoryImpactActionModal
        visible={Boolean(driverFlow.action)}
        title={driverActionTitle(driverFlow.action?.kind)}
        subtitle={driverFlow.action?.target.name || ''}
        loading={driverFlow.impactLoading}
        loadingLabel="Revisando jornada, unidad, documentos y dependencias…"
        error={driverFlow.impactError}
        onRetry={() => driverFlow.action && void driverFlow.reload(driverFlow.action.target)}
        submitting={driverFlow.submitting}
        confirmEnabled={driverConfirmEnabled}
        confirmLabel={driverActionConfirmLabel(driverFlow.action?.kind)}
        danger={driverFlow.action?.kind === 'delete' || driverFlow.action?.kind === 'offboard'}
        onCancel={driverFlow.close}
        onConfirm={() => void executeDriverAction()}
        styles={styles}>
        {driverFlow.impact ? (
          <View style={styles.impactBox}>
            {driverFlow.impact.blockers.map((entry) => <Text key={entry} style={styles.dangerText}>• {entry}</Text>)}
            {driverFlow.impact.warnings.map((entry) => <Text key={entry} style={styles.sectionSubtitle}>• {entry}</Text>)}
            <Text style={styles.sectionSubtitle}>Unidad actual: {driverFlow.impact.assignedVehicle?.code || 'Sin unidad'}</Text>
            <Text style={styles.sectionSubtitle}>Sesiones a revocar: {driverFlow.impact.sessionsToRevoke || 0}</Text>
            <Text style={styles.sectionSubtitle}>Documentos relacionados: {driverFlow.impact.relatedDocuments?.count || 0}</Text>
          </View>
        ) : null}

        {driverFlow.action?.kind !== 'reactivate' ? (
          <>
            <Text style={styles.inputLabel}>Motivo</Text>
            <TextInput
              value={driverFlow.reason}
              onChangeText={driverFlow.setReason}
              editable={!driverFlow.submitting}
              multiline
              placeholder="Ej. baja administrativa"
              placeholderTextColor={theme.colors.muted}
              style={[styles.input, styles.textArea]}
            />
          </>
        ) : null}

        {driverFlow.action?.kind === 'delete' ? (
          <>
            <Text style={styles.dangerText}>La eliminación definitiva solo procede después de la baja, sin unidad ni jornada activa. El historial operativo se conserva.</Text>
            <Text style={styles.inputLabel}>Escribe ELIMINAR para confirmar</Text>
            <TextInput
              value={driverConfirmation}
              onChangeText={setDriverConfirmation}
              editable={!driverFlow.submitting}
              autoCapitalize="characters"
              placeholder="ELIMINAR"
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
            />
          </>
        ) : null}
      </DirectoryImpactActionModal>

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

      <DirectoryImpactActionModal
        visible={Boolean(vehicleFlow.action)}
        title={vehicleFlow.action?.kind === 'retire' ? 'Dar de baja la unidad' : 'Eliminar unidad'}
        subtitle={vehicleFlow.action ? `${vehicleFlow.action.target.code} · ${vehicleFlow.action.target.plate}` : ''}
        loading={vehicleFlow.impactLoading}
        loadingLabel="Revisando conductor, ruta, jornada e historial…"
        error={vehicleFlow.impactError}
        onRetry={() => vehicleFlow.action && void vehicleFlow.reload(vehicleFlow.action.target)}
        submitting={vehicleFlow.submitting}
        confirmEnabled={vehicleConfirmEnabled}
        confirmLabel={vehicleFlow.action?.kind === 'retire' ? 'Dar de baja' : 'Eliminar'}
        danger
        onCancel={vehicleFlow.close}
        onConfirm={() => void executeVehicleAction()}
        styles={styles}>
        {vehicleFlow.impact ? (
          <View style={styles.impactBox}>
            {vehicleFlow.impact.blockers.map((entry) => <Text key={entry} style={styles.dangerText}>• {entry}</Text>)}
            {vehicleFlow.impact.actionsRequired.map((entry) => <Text key={entry} style={styles.sectionSubtitle}>• Requiere: {entry}</Text>)}
            <Text style={styles.sectionSubtitle}>Historial: {vehicleFlow.impact.history?.total || 0} registros · Documentos: {vehicleFlow.impact.documents?.count || 0}</Text>
            {vehicleFlow.action?.kind === 'delete' && vehicleFlow.impact.mustRetire ? <Text style={styles.dangerText}>Esta unidad conserva historial; debe darse de baja en lugar de eliminarse.</Text> : null}
          </View>
        ) : null}

        {vehicleFlow.action?.kind === 'retire' ? (
          <>
            <Text style={styles.inputLabel}>Motivo</Text>
            <TextInput value={vehicleFlow.reason} onChangeText={vehicleFlow.setReason} editable={!vehicleFlow.submitting} multiline placeholder="Ej. fin de vida útil" placeholderTextColor={theme.colors.muted} style={[styles.input, styles.textArea]} />
          </>
        ) : null}
      </DirectoryImpactActionModal>

      <DirectorySheetModal
        visible={Boolean(assignmentDriver)}
        title={`Unidad · ${assignmentDriver?.name || ''}`}
        subtitle="Misma transición operativa del portal de Ventas: el conductor puede quedar activo sin unidad o cambiar a una disponible."
        closeDisabled={assignmentLoading}
        onClose={() => setAssignmentDriver(null)}
        styles={styles}>
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
      </DirectorySheetModal>

      <DirectorySheetModal
        visible={Boolean(assignmentVehicle)}
        title={`Conductor · ${assignmentVehicle?.code || ''}`}
        subtitle={assignmentVehicle?.driverId ? 'Libera primero al conductor actual antes de reasignar.' : 'Selecciona un conductor activo.'}
        closeDisabled={assignmentLoading}
        onClose={() => setAssignmentVehicle(null)}
        styles={styles}>
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
      </DirectorySheetModal>
    </AppShell>
  );

}

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
  const { theme } = useAppTheme();
  const styles = useMemo(() => createDirectoryStyles(theme), [theme]);
  const color = danger ? theme.colors.danger : accent ? theme.colors.accent : theme.colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, pressed ? styles.actionButtonPressed : undefined]}>
      <MaterialCommunityIcons name={icon} size={18} color={color} />
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createDirectoryStyles(theme), [theme]);

  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

