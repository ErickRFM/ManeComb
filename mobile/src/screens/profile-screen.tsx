import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, DesignSystem } from '@/constants/theme';
import {
  getApiErrorMessage,
  getDocumentsRequest,
  resolveAssetUrl,
  uploadDriverDocumentRequest,
  type DocumentUploadFile,
} from '@/src/api/client';
import { AppCard } from '@/src/components/app-card';
import { AppShell } from '@/src/components/app-shell';
import { StatusPill } from '@/src/components/status-pill';
import { PresenceBadge } from '@/src/components/presence-indicator';
import { UserAvatar } from '@/src/components/user-avatar';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import * as ImagePicker from '@/src/native/image-picker';
import { useAppStore } from '@/src/store/use-app-store';
import { formatRole } from '@/src/utils/format';
import { getPresenceStatus } from '@/src/utils/presence';
import {
  formatOperationalSchedule,
  getOperationalScheduleState,
} from '@/src/utils/operational-schedule';
import { InfoTile } from './profile/components/info-tile';
import { createStyles } from './profile/profile-screen.styles';
import {
  canReplaceDriverDocument,
  DEFAULT_DRIVER_DOCUMENT,
  getDocumentPresentation,
  getDocumentSectionTitle,
  getDriverDocumentEmptyMessage,
  getDriverDocumentPresentation,
  getDriverPresentation,
} from './profile/profile.utils';
import type { DocumentItem } from '@/src/types/app';

async function pickDriverDocument(): Promise<DocumentUploadFile | null> {
  if (Platform.OS === 'web') {
    const documentApi = globalThis.document;
    if (!documentApi?.createElement) return null;

    return await new Promise((resolve) => {
      const input = documentApi.createElement('input');
      input.type = 'file';
      input.accept = 'application/pdf,image/jpeg,image/png,image/webp';
      input.onchange = () => resolve(input.files?.[0] || null);
      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
  });
  const asset = result.assets[0];

  if (result.canceled || !asset?.uri) return null;

  return {
    uri: asset.uri,
    name: asset.fileName || `documento-${Date.now()}.jpg`,
    type: asset.mimeType || 'image/jpeg',
  };
}

export function ProfileScreen() {
  const { width } = useWindowDimensions();
  const isCompact = width < DesignSystem.breakpoints.compact;
  const isPhone = width < DesignSystem.breakpoints.phone;
  const { isDark, setThemeMode, theme } = useAppTheme();
  const { documents, mapData, observability, presenceByUser, signOut, user, users } = useAppStore(
    useShallow((state) => ({
      documents: state.documents,
      mapData: state.mapData,
      observability: state.observability,
      presenceByUser: state.presenceByUser,
      signOut: state.signOut,
      user: state.user,
      users: state.users,
    }))
  );
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [documentExpiresAt, setDocumentExpiresAt] = useState('');
  const [documentMessage, setDocumentMessage] = useState<string | null>(null);
  const [uploadingDocumentId, setUploadingDocumentId] = useState<string | null>(null);
  const userId = user?.id;

  const styles = useMemo(() => createStyles(theme, isCompact, isPhone), [theme, isCompact, isPhone]);

  useEffect(() => {
    if (!userId) return;
    getDocumentsRequest()
      .then((nextDocuments) => useAppStore.setState({ documents: nextDocuments }))
      .catch(() => undefined);
  }, [userId]);

  if (!user) return null;

  const roleLabel = user.accountType === 'company_owner' ? 'Propietario' : formatRole(user.role);
  const scheduleState = getOperationalScheduleState(user.operationalSchedule);
  const scheduleLabel = formatOperationalSchedule(user.operationalSchedule);
  const presence = getPresenceStatus(presenceByUser, user.id);
  const drivers = users
    .filter((entry) => entry.role === 'driver')
    .sort((left, right) => left.name.localeCompare(right.name, 'es'));
  const vehicles = mapData?.vehicles || [];
  const getDriverDocuments = (driverId: string, vehicleId: string | null) =>
    documents.filter((document) =>
      (document.ownerType === 'driver' && document.ownerId === driverId)
      || (document.ownerType === 'vehicle' && Boolean(vehicleId) && document.ownerId === vehicleId)
    );
  const ownDocuments = getDriverDocuments(user.id, user.vehicleId);
  const handleDriverDocumentUpload = async (document?: DocumentItem) => {
    const expiresAt = new Date(documentExpiresAt);
    if (!documentExpiresAt || Number.isNaN(expiresAt.getTime())) {
      setDocumentMessage('Ingresa la vigencia con formato AAAA-MM-DD.');
      return;
    }

    const file = await pickDriverDocument();
    if (!file) return;

    setDocumentMessage(null);
    setUploadingDocumentId(document?.id || 'new');
    try {
      await uploadDriverDocumentRequest({
        category: document?.category || DEFAULT_DRIVER_DOCUMENT.category,
        expiresAt: expiresAt.toISOString(),
        file,
        name: document?.name || DEFAULT_DRIVER_DOCUMENT.name,
      });
      const nextDocuments = await getDocumentsRequest();
      useAppStore.setState({ documents: nextDocuments });
      setDocumentExpiresAt('');
      setDocumentMessage('Documento enviado para revisión.');
    } catch (error) {
      setDocumentMessage(getApiErrorMessage(error, 'No fue posible subir el documento.'));
    } finally {
      setUploadingDocumentId(null);
    }
  };

  return (
    <AppShell
      scroll
      sectionKey="perfil"
      mobileTitle="Perfil"
      mobileBadges={[
        { label: roleLabel, tone: 'info' },
      ]}
      header={
        <View style={styles.header}>
          <Text style={styles.title}>Perfil</Text>
        </View>
      }>
      <View style={styles.mainGrid}>
        <AppCard>
          <View style={styles.identityBlock}>
            <View style={styles.profileTop}>
              <View style={styles.avatarBox}>
                <UserAvatar user={user} status={presence} showStatus size={112} />
              </View>
              <View style={styles.profileCopy}>
                <Text style={styles.userName}>{user.name}</Text>
                <View style={styles.pillsRow}>
                  <StatusPill label={roleLabel} tone="info" />
                  <PresenceBadge status={presence} />
                </View>
              </View>
            </View>

            <View style={styles.infoGrid}>
              <InfoTile icon="email-outline" label="Correo" value={user.email} styles={styles} theme={theme} />
              <InfoTile icon="phone-outline" label="Telefono" value={user.phone || 'Pendiente'} styles={styles} theme={theme} />
              <InfoTile icon="clock-outline" label="Turno" value={user.shift || 'Control de flota'} styles={styles} theme={theme} />
              <InfoTile icon="calendar-clock" label="Horario" value={`${scheduleLabel} - ${scheduleState.label}`} styles={styles} theme={theme} />
            </View>
          </View>
        </AppCard>

        <View style={styles.sideColumn}>
          <AppCard>
            <View style={styles.pillsRow}>
              <Text style={styles.cardTitle}>{getDocumentSectionTitle(user.role)}</Text>
              {user.role !== 'driver' && drivers.length ? <StatusPill label={`${drivers.length} conductores`} tone="info" /> : null}
            </View>
            {user.role === 'driver' ? (
              <View style={styles.notificationList}>
                {getDriverDocumentEmptyMessage(ownDocuments) ? (
                  <Text style={styles.emptyNotifications}>{getDriverDocumentEmptyMessage(ownDocuments)}</Text>
                ) : null}
                {ownDocuments.map((document) => {
                  const presentation = getDriverDocumentPresentation(document);
                  const color = presentation.tone === 'positive'
                    ? theme.colors.success
                    : presentation.tone === 'danger' ? theme.colors.danger : theme.colors.warning;
                  const documentUrl = resolveAssetUrl(document.fileUrl);
                  const canReplace = canReplaceDriverDocument(document);

                  return (
                    <View key={document.id} style={styles.driverDocumentBlock}>
                      <View style={styles.driverRow}>
                        <MaterialCommunityIcons name={presentation.icon} size={20} color={color} />
                        <View style={styles.driverCopy}>
                          <Text style={styles.notificationTitle}>{document.name}</Text>
                          <Text style={styles.notificationBody}>{document.category} · {document.status}</Text>
                        </View>
                        <StatusPill label={presentation.label} tone={presentation.tone} />
                      </View>
                      {document.reviewStatus === 'rejected' && document.reviewNotes ? (
                        <Text style={styles.documentReviewNote}>{document.reviewNotes}</Text>
                      ) : null}
                      {documentUrl || canReplace ? (
                        <View style={styles.documentActions}>
                          {documentUrl ? (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => Linking.openURL(documentUrl).catch(() => setDocumentMessage('No fue posible abrir el archivo.'))}
                              style={styles.documentActionButton}>
                              <Text style={styles.documentActionText}>Ver archivo</Text>
                            </Pressable>
                          ) : null}
                          {canReplace ? (
                            <Pressable
                              accessibilityRole="button"
                              disabled={Boolean(uploadingDocumentId)}
                              onPress={() => handleDriverDocumentUpload(document)}
                              style={styles.documentActionButton}>
                              {uploadingDocumentId === document.id
                                ? <ActivityIndicator size="small" color={theme.colors.accent} />
                                : <Text style={styles.documentActionText}>Reemplazar</Text>}
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                <TextInput
                  accessibilityLabel="Fecha de vencimiento del documento"
                  value={documentExpiresAt}
                  onChangeText={setDocumentExpiresAt}
                  placeholder="Vigencia AAAA-MM-DD"
                  placeholderTextColor={theme.colors.muted}
                  style={styles.documentExpiryInput}
                />
                {!ownDocuments.length ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={Boolean(uploadingDocumentId)}
                    onPress={() => handleDriverDocumentUpload()}
                    style={styles.documentUploadButton}>
                    {uploadingDocumentId === 'new'
                      ? <ActivityIndicator size="small" color={AppTheme.colors.text} />
                      : <Text style={styles.documentUploadText}>Subir documento</Text>}
                  </Pressable>
                ) : null}
                {documentMessage ? <Text style={styles.documentMessage}>{documentMessage}</Text> : null}
              </View>
            ) : drivers.length ? (
              <View style={styles.notificationList}>
                {drivers.map((driver) => {
                  const vehicle = vehicles.find((entry) => entry.id === driver.vehicleId);
                  const driverDocuments = getDriverDocuments(driver.id, driver.vehicleId);
                  const driverStatus = getDriverPresentation(driverDocuments);
                  const isSelected = selectedDriverId === driver.id;
                  return (
                    <View key={driver.id} style={styles.notificationList}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Ver documentos de ${driver.name}`}
                        accessibilityState={{ expanded: isSelected }}
                        onPress={() => setSelectedDriverId(isSelected ? null : driver.id)}
                        style={styles.driverRow}>
                        <UserAvatar user={driver} size={38} />
                        <View style={styles.driverCopy}>
                          <Text style={styles.notificationTitle}>{driver.name}</Text>
                          <Text style={styles.notificationBody}>Unidad: {vehicle?.code || 'Sin unidad asignada'}</Text>
                        </View>
                        <StatusPill label={driverStatus.label} tone={driverStatus.tone} />
                        <MaterialCommunityIcons name={isSelected ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.muted} />
                      </Pressable>
                      {isSelected ? (
                        <View style={styles.documentDetail}>
                          {driverDocuments.length ? driverDocuments.map((document) => {
                            const presentation = getDocumentPresentation(document.reviewStatus);
                            const color = presentation.tone === 'positive'
                              ? theme.colors.success
                              : presentation.tone === 'danger' ? theme.colors.danger : theme.colors.warning;
                            return (
                              <View key={document.id} style={styles.driverRow}>
                                <MaterialCommunityIcons name={presentation.icon} size={20} color={color} />
                                <View style={styles.driverCopy}>
                                  <Text style={styles.notificationTitle}>{document.name}</Text>
                                  <Text style={styles.notificationBody}>{document.category} · {document.status}</Text>
                                </View>
                                <StatusPill label={presentation.label} tone={presentation.tone} />
                              </View>
                            );
                          }) : <Text style={styles.emptyNotifications}>No hay documentos cargados para este conductor o su unidad.</Text>}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.emptyNotifications}>No hay conductores registrados en la empresa.</Text>
            )}
          </AppCard>

          <AppCard>
            <Text style={styles.cardTitle}>Apariencia</Text>
            <View style={styles.themeRow}>
              <Pressable
                onPress={() => setThemeMode('light')}
                style={[
                  styles.themeTab,
                  !isDark ? { backgroundColor: theme.colors.card, borderColor: theme.colors.line } : undefined,
                ]}>
                <MaterialCommunityIcons
                  name="white-balance-sunny"
                  size={18}
                  color={!isDark ? theme.colors.accent : theme.colors.muted}
                />
                <Text style={[styles.themeTabText, { color: !isDark ? theme.colors.text : theme.colors.muted }]}>Claro</Text>
              </Pressable>
              <Pressable
                onPress={() => setThemeMode('dark')}
                style={[
                  styles.themeTab,
                  isDark ? { backgroundColor: theme.colors.card, borderColor: theme.colors.line } : undefined,
                ]}>
                <MaterialCommunityIcons
                  name="moon-waning-crescent"
                  size={18}
                  color={isDark ? theme.colors.accent : theme.colors.muted}
                />
                <Text style={[styles.themeTabText, { color: isDark ? theme.colors.text : theme.colors.muted }]}>Oscuro</Text>
              </Pressable>
            </View>
          </AppCard>

          {observability ? (
            <AppCard>
              <Text style={styles.cardTitle}>Estado operativo</Text>
              <View style={styles.infoGrid}>
                <InfoTile icon="alert-circle-outline" label="Errores API" value={String(observability.apiErrors)} styles={styles} theme={theme} />
                <InfoTile icon="timer-alert-outline" label="Solicitudes lentas" value={String(observability.slowRequests)} styles={styles} theme={theme} />
                <InfoTile icon="bell-check-outline" label="Push entregados" value={String(observability.pushDelivered)} styles={styles} theme={theme} />
                <InfoTile icon="bell-alert-outline" label="Push fallidos" value={String(observability.pushFailed)} styles={styles} theme={theme} />
                <InfoTile icon="alert-decagram-outline" label="Incidencias críticas" value={String(observability.activeCriticalIncidents)} styles={styles} theme={theme} />
                <InfoTile icon="cart-check" label="Eventos checkout" value={String(observability.checkoutEvents)} styles={styles} theme={theme} />
                <InfoTile icon="phone-in-talk-outline" label="Sesiones RTC" value={String(observability.rtc.recentSessions)} styles={styles} theme={theme} />
                <InfoTile icon="phone-check-outline" label="RTC completadas" value={String(observability.rtc.completedSessions)} styles={styles} theme={theme} />
                <InfoTile icon="timer-outline" label="Promedio RTC" value={`${Math.round(observability.rtc.averageDurationSeconds)} s`} styles={styles} theme={theme} />
              </View>
              {observability.recentEvents.length ? (
                <View style={styles.notificationList}>
                  {observability.recentEvents.map((event) => (
                    <View key={event.id} style={[styles.notificationRow, { borderColor: theme.colors.line, backgroundColor: theme.colors.surfaceAlt }]}>
                      <View style={[styles.notificationIcon, { backgroundColor: event.level === 'error' ? theme.colors.dangerSoft : theme.colors.infoSoft }]}>
                        <MaterialCommunityIcons name="pulse" size={19} color={event.level === 'error' ? theme.colors.danger : theme.colors.info} />
                      </View>
                      <View style={styles.notificationCopy}>
                        <Text style={styles.notificationTitle}>{event.message || event.type}</Text>
                        <Text style={styles.notificationBody}>{event.scope} · {new Date(event.createdAt).toLocaleString('es-MX')}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </AppCard>
          ) : null}

          <AppCard style={styles.sessionCard}>
            <Text style={styles.cardTitle}>Sesion</Text>
            <Pressable
              onPress={() => setShowLogoutConfirm(true)}
              style={styles.logoutBtn}>
              <MaterialCommunityIcons name="logout" size={18} color={theme.colors.accent} />
              <Text style={styles.logoutText}>Cerrar sesion</Text>
            </Pressable>
          </AppCard>

          <ConfirmModal
            visible={showLogoutConfirm}
            title="Cerrar sesion"
            description="Se cerrara tu sesion actual. Deberas iniciar sesion nuevamente para acceder."
            confirmLabel="Cerrar sesion"
            cancelLabel="Cancelar"
            danger
            onCancel={() => setShowLogoutConfirm(false)}
            onConfirm={() => {
              setShowLogoutConfirm(false);
              signOut().finally(() => router.replace('/login'));
            }}
          />
        </View>
      </View>
    </AppShell>
  );
}
