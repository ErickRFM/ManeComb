import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { StatusPill } from '@/src/components/status-pill';
import { PresenceBadge } from '@/src/components/presence-indicator';
import { UserAvatar } from '@/src/components/user-avatar';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { openAuthenticatedDocument } from '@/src/native/document-files';
import { useAppStore } from '@/src/store/use-app-store';
import type { DocumentItem, Role, User, Vehicle } from '@/src/types/app';
import { formatRole } from '@/src/utils/format';
import {
  canManageMobileDocuments,
  canManageMobileUsers,
  canManageMobileVehicles,
} from '@/src/utils/mobile-authority';
import { getPresenceStatus } from '@/src/utils/presence';
import { formatOperationalSchedule, getOperationalScheduleState } from '@/src/utils/operational-schedule';
import { getDocumentStatus } from '@/src/screens/documents/documents.utils';

type DirectoryTab = 'personal' | 'vehicles';
type DriverActionKind = 'offboard' | 'reactivate' | 'delete';
type VehicleActionKind = 'retire' | 'delete';
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

function formatAccountStatus(status?: string) {
  if (status === 'active') return 'Cuenta activa';
  if (status === 'suspended') return 'Cuenta suspendida';
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

export function UsersScreen() {
  const { width } = useWindowDimensions();
  const isPhone = width < DesignSystem.breakpoints.phone;
  const { theme } = useAppTheme();
  const { loadUsers, mapData, presenceByUser, refreshAll, token, user, users } = useAppStore(
    useShallow((state) => ({
      loadUsers: state.loadUsers,
      mapData: state.mapData,
      presenceByUser: state.presenceByUser,
      refreshAll: state.refreshAll,
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

  const [driverAction, setDriverAction] = useState<{ kind: DriverActionKind; target: User } | null>(null);
  const [driverImpact, setDriverImpact] = useState<DriverLifecycleImpact | null>(null);
  const [driverActionLoading, setDriverActionLoading] = useState(false);
  const [driverReason, setDriverReason] = useState('');

  const [vehicleEditor, setVehicleEditor] = useState<ManagedVehicle | 'new' | null>(null);
  const [vehicleDraft, setVehicleDraft] = useState<VehicleDraft>(createEmptyVehicleDraft());
  const [vehicleSaving, setVehicleSaving] = useState(false);
  const [vehicleAction, setVehicleAction] = useState<{ kind: VehicleActionKind; target: ManagedVehicle } | null>(null);
  const [vehicleImpact, setVehicleImpact] = useState<VehicleDeletionImpact | null>(null);
  const [vehicleActionLoading, setVehicleActionLoading] = useState(false);
  const [vehicleReason, setVehicleReason] = useState('');
  const [assignmentVehicle, setAssignmentVehicle] = useState<ManagedVehicle | null>(null);
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
      const [, , nextVehicles] = await Promise.all([
        loadUsers(),
        refreshAll(),
        getManagedVehiclesRequest(canManageMobileVehicles(user)),
      ]);
      setManagedVehicles(nextVehicles);
      setMessage(null);
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible actualizar el directorio.'));
    } finally {
      setIsRefreshing(false);
      setVehiclesLoading(false);
    }
  }, [loadUsers, refreshAll, user]);

  useEffect(() => {
    if (user) {
      refreshDirectory().catch(() => undefined);
    }
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

  const openDriverAction = async (kind: DriverActionKind, target: User) => {
    setDriverAction({ kind, target });
    setDriverImpact(null);
    setDriverReason('');
    setDriverActionLoading(true);
    setMessage(null);
    try {
      setDriverImpact(await getDriverLifecycleImpactRequest(target.id));
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible revisar el impacto de la acción.'));
    } finally {
      setDriverActionLoading(false);
    }
  };

  const executeDriverAction = async () => {
    if (!driverAction) return;
    if (driverAction.kind !== 'reactivate' && driverReason.trim().length < 3) {
      setMessage('Escribe un motivo de al menos 3 caracteres.');
      return;
    }
    setDriverActionLoading(true);
    try {
      if (driverAction.kind === 'offboard') {
        await offboardDriverRequest(driverAction.target.id, driverReason.trim());
        setMessage('Conductor dado de baja. Su unidad quedó liberada.');
      } else if (driverAction.kind === 'reactivate') {
        await reactivateDriverRequest(driverAction.target.id);
        setMessage('Conductor reactivado correctamente.');
      } else {
        await deleteDriverRequest(driverAction.target.id, driverReason.trim());
        setMessage('Conductor eliminado de forma segura. El historial se conservó.');
      }
      setDriverAction(null);
      setDriverImpact(null);
      await refreshDirectory();
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible completar la acción sobre el conductor.'));
    } finally {
      setDriverActionLoading(false);
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
      await refreshDirectory();
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible guardar la unidad.'));
    } finally {
      setVehicleSaving(false);
    }
  };

  const openVehicleAction = async (kind: VehicleActionKind, target: ManagedVehicle) => {
    setVehicleAction({ kind, target });
    setVehicleImpact(null);
    setVehicleReason('');
    setVehicleActionLoading(true);
    setMessage(null);
    try {
      setVehicleImpact(await getVehicleDeletionImpactRequest(target.id));
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible revisar las dependencias de la unidad.'));
    } finally {
      setVehicleActionLoading(false);
    }
  };

  const executeVehicleAction = async () => {
    if (!vehicleAction) return;
    if (vehicleAction.kind === 'retire' && vehicleReason.trim().length < 3) {
      setMessage('Escribe un motivo de retiro de al menos 3 caracteres.');
      return;
    }
    setVehicleActionLoading(true);
    try {
      if (vehicleAction.kind === 'retire') {
        await retireVehicleRequest(vehicleAction.target.id, vehicleReason.trim());
        setMessage('Unidad retirada. Su historial permanece disponible.');
      } else {
        await deleteManagedVehicleRequest(vehicleAction.target.id);
        setMessage('Unidad sin historial eliminada correctamente.');
      }
      setVehicleAction(null);
      setVehicleImpact(null);
      await refreshDirectory();
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible completar la acción sobre la unidad.'));
    } finally {
      setVehicleActionLoading(false);
    }
  };

  const assignDriver = async (driverId: string | null) => {
    if (!assignmentVehicle || !canManageUsers) return;
    setAssignmentLoading(true);
    try {
      if (driverId === null) {
        if (!assignmentVehicle.driverId) return;
        await assignDriverVehicleRequest(assignmentVehicle.driverId, null);
        setMessage('Conductor liberado de la unidad.');
      } else {
        await assignDriverVehicleRequest(driverId, assignmentVehicle.id);
        setMessage('Conductor asignado a la unidad.');
      }
      setAssignmentVehicle(null);
      await refreshDirectory();
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible actualizar la asignación.'));
    } finally {
      setAssignmentLoading(false);
    }
  };

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
          <Text style={styles.subtitle}>Personal registrado y unidades de la empresa, sin duplicar la edición del perfil del conductor.</Text>
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

                return (
                  <View key={entry.id} style={styles.userRow}>
                    <View style={styles.userTop}>
                      <UserAvatar user={entry} status={presence} showStatus size={56} />
                      <View style={styles.userMeta}>
                        <Text style={styles.userName} numberOfLines={2}>{entry.name}</Text>
                        <Text style={styles.userEmail} numberOfLines={1}>{entry.email}</Text>
                        <View style={styles.pillsRow}>
                          <StatusPill label={formatRole(entry.role)} tone={roleTone(entry.role)} />
                          <StatusPill label={formatAccountStatus(entry.userStatus)} tone={accountStatusTone(entry.userStatus)} />
                          <PresenceBadge status={presence} />
                        </View>
                      </View>
                    </View>

                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryText}>Unidad: {vehicle?.code || 'Sin unidad'}</Text>
                      <Text style={styles.summaryText}>Tel: {entry.phone || 'Sin teléfono'}</Text>
                    </View>

                    <View style={styles.actionRow}>
                      <ActionButton
                        icon={isExpanded ? 'chevron-up' : 'account-details-outline'}
                        label={isExpanded ? 'Ocultar perfil' : 'Ver perfil'}
                        onPress={() => setExpandedUserId(isExpanded ? null : entry.id)}
                      />
                      {canOpenDocuments && entry.role === 'driver' ? (
                        <ActionButton
                          accent
                          icon="file-document-multiple-outline"
                          label="Documentos"
                          onPress={() => void openDocuments('driver', entry.id, entry.name)}
                        />
                      ) : null}
                      {canManageUsers && entry.role === 'driver' && entry.userStatus !== 'suspended' ? (
                        <ActionButton
                          danger
                          icon="account-off-outline"
                          label="Dar de baja"
                          onPress={() => void openDriverAction('offboard', entry)}
                        />
                      ) : null}
                      {canManageUsers && entry.role === 'driver' && entry.userStatus === 'suspended' ? (
                        <>
                          <ActionButton
                            accent
                            icon="account-check-outline"
                            label="Reactivar"
                            onPress={() => void openDriverAction('reactivate', entry)}
                          />
                          <ActionButton
                            danger
                            icon="account-remove-outline"
                            label="Eliminar"
                            onPress={() => void openDriverAction('delete', entry)}
                          />
                        </>
                      ) : null}
                    </View>

                    {isExpanded ? (
                      <View style={styles.profileDetail}>
                        <View style={styles.detailsGrid}>
                          <DetailItem label="Correo" value={entry.email || 'Sin correo'} />
                          <DetailItem label="Teléfono" value={entry.phone || 'Sin teléfono'} />
                          <DetailItem label="Turno" value={entry.shift || 'Sin turno'} />
                          <DetailItem label="Horario" value={`${scheduleLabel} · ${scheduleState.label}`} />
                          <DetailItem label="Unidad" value={vehicle?.code || 'Sin unidad asignada'} />
                          <DetailItem label="Placas" value={vehicle?.plate || 'Sin placas'} />
                          <DetailItem label="Ruta" value={getVehicleRoute(vehicle)} />
                          <DetailItem label="Último acceso" value={formatDateTime(entry.lastAccessAt)} />
                          {entry.suspendedAt ? <DetailItem label="Suspendida desde" value={formatDateTime(entry.suspendedAt)} /> : null}
                        </View>
                        {entry.role === 'driver' ? (
                          <Text style={styles.profileNote}>El conductor mantiene sus datos personales y documentos desde su perfil. El administrador solo consulta y aplica acciones operativas seguras.</Text>
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
                        <ActionButton danger icon="archive-arrow-down-outline" label="Dar de baja" onPress={() => void openVehicleAction('retire', vehicle)} />
                      </>
                    ) : null}
                    {canOpenDocuments ? (
                      <ActionButton accent icon="file-document-multiple-outline" label="Documentos" onPress={() => void openDocuments('vehicle', vehicle.id, vehicle.code)} />
                    ) : null}
                    {canManageVehicles ? (
                      <ActionButton danger icon="delete-outline" label="Eliminar" onPress={() => void openVehicleAction('delete', vehicle)} />
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </AppCard>
      )}

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

      <Modal visible={Boolean(driverAction)} transparent animationType="fade" onRequestClose={() => !driverActionLoading && setDriverAction(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{driverAction?.kind === 'offboard' ? 'Dar de baja al conductor' : driverAction?.kind === 'reactivate' ? 'Reactivar conductor' : 'Eliminar conductor'}</Text>
            <Text style={styles.sectionSubtitle}>{driverAction?.target.name}</Text>
            {driverActionLoading && !driverImpact ? <ActivityIndicator color={theme.colors.accent} /> : null}
            {driverImpact ? (
              <View style={styles.impactBox}>
                {driverImpact.blockers.map((entry) => <Text key={entry} style={styles.dangerText}>• {entry}</Text>)}
                {driverImpact.warnings.map((entry) => <Text key={entry} style={styles.sectionSubtitle}>• {entry}</Text>)}
                <Text style={styles.sectionSubtitle}>Documentos relacionados: {driverImpact.relatedDocuments?.count || 0}</Text>
              </View>
            ) : null}
            {driverAction?.kind !== 'reactivate' ? (
              <>
                <Text style={styles.inputLabel}>Motivo</Text>
                <TextInput value={driverReason} onChangeText={setDriverReason} multiline placeholder="Ej. baja administrativa" placeholderTextColor={theme.colors.muted} style={[styles.input, styles.textArea]} />
              </>
            ) : null}
            {driverAction?.kind === 'delete' ? <Text style={styles.dangerText}>La eliminación solo procede después de la baja, sin unidad ni jornada activa. El historial operativo se conserva.</Text> : null}
            <View style={styles.modalActions}>
              <Pressable disabled={driverActionLoading} onPress={() => setDriverAction(null)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancelar</Text></Pressable>
              <Pressable
                disabled={driverActionLoading || (driverAction?.kind === 'offboard' && driverImpact?.canOffboard === false) || (driverAction?.kind === 'delete' && driverImpact?.canDelete === false)}
                onPress={() => void executeDriverAction()}
                style={[styles.primaryButton, driverAction?.kind === 'delete' || driverAction?.kind === 'offboard' ? styles.dangerButton : undefined]}>
                {driverActionLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Confirmar</Text>}
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

      <Modal visible={Boolean(vehicleAction)} transparent animationType="fade" onRequestClose={() => !vehicleActionLoading && setVehicleAction(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{vehicleAction?.kind === 'retire' ? 'Dar de baja la unidad' : 'Eliminar unidad'}</Text>
            <Text style={styles.sectionSubtitle}>{vehicleAction?.target.code} · {vehicleAction?.target.plate}</Text>
            {vehicleActionLoading && !vehicleImpact ? <ActivityIndicator color={theme.colors.accent} /> : null}
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
                <TextInput value={vehicleReason} onChangeText={setVehicleReason} multiline placeholder="Ej. fin de vida útil" placeholderTextColor={theme.colors.muted} style={[styles.input, styles.textArea]} />
              </>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable disabled={vehicleActionLoading} onPress={() => setVehicleAction(null)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancelar</Text></Pressable>
              <Pressable
                disabled={vehicleActionLoading || (vehicleAction?.kind === 'retire' && vehicleImpact?.canRetire === false) || (vehicleAction?.kind === 'delete' && vehicleImpact?.canDeletePermanently === false)}
                onPress={() => void executeVehicleAction()}
                style={[styles.primaryButton, styles.dangerButton]}>
                {vehicleActionLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{vehicleAction?.kind === 'retire' ? 'Dar de baja' : 'Eliminar'}</Text>}
              </Pressable>
            </View>
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
              <Pressable onPress={() => setAssignmentVehicle(null)} style={styles.iconButton}><MaterialCommunityIcons name="close" size={22} color={theme.colors.text} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalScroll}>
              {assignmentVehicle?.driverId ? (
                <Pressable disabled={assignmentLoading} onPress={() => void assignDriver(null)} style={[styles.driverChoice, styles.dangerChoice]}>
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
                    <Pressable key={driver.id} disabled={assignmentLoading} onPress={() => void assignDriver(driver.id)} style={styles.driverChoice}>
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
    dangerText: { color: theme.colors.danger, fontFamily: Typography.body, fontSize: 12, fontWeight: '800', lineHeight: 18 },
    vehicleHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    vehicleIcon: { alignItems: 'center', backgroundColor: theme.colors.card, borderColor: theme.colors.line, borderRadius: 18, borderWidth: 1, height: 56, justifyContent: 'center', width: 56 },
    overlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.72)', flex: 1, justifyContent: 'center', padding: 18 },
    modal: { backgroundColor: theme.colors.surface, borderColor: theme.colors.line, borderRadius: AppTheme.radius.lg, borderWidth: 1, gap: 12, maxWidth: 560, padding: isPhone ? 16 : 20, width: '100%' },
    modalLarge: { backgroundColor: theme.colors.surface, borderColor: theme.colors.line, borderRadius: AppTheme.radius.lg, borderWidth: 1, maxHeight: '86%', maxWidth: 680, padding: isPhone ? 16 : 20, width: '100%' },
    modalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
    modalTitle: { color: theme.colors.text, fontFamily: Typography.display, fontSize: 20, fontWeight: '900' },
    modalActions: { flexDirection: isPhone ? 'column-reverse' : 'row', gap: 10, justifyContent: 'flex-end' },
    modalScroll: { gap: 10, paddingTop: 14 },
    iconButton: { alignItems: 'center', backgroundColor: theme.colors.card, borderColor: theme.colors.line, borderRadius: 20, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
    documentRow: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.line, borderRadius: AppTheme.radius.md, borderWidth: 1, gap: 10, padding: 12 },
    documentTitle: { color: theme.colors.text, fontFamily: Typography.body, fontSize: 14, fontWeight: '900' },
    impactBox: { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.line, borderRadius: AppTheme.radius.md, borderWidth: 1, gap: 7, padding: 12 },
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
  });
}
