import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { DesignSystem } from '@/constants/theme';
import { AppCard } from '@/src/components/app-card';
import { AppShell } from '@/src/components/app-shell';
import { StatusPill } from '@/src/components/status-pill';
import { PresenceBadge } from '@/src/components/presence-indicator';
import { UserAvatar } from '@/src/components/user-avatar';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import { formatRole } from '@/src/utils/format';
import { getPresenceStatus } from '@/src/utils/presence';
import {
  formatOperationalSchedule,
  getOperationalScheduleState,
} from '@/src/utils/operational-schedule';
import { InfoTile } from './profile/components/info-tile';
import { createStyles } from './profile/profile-screen.styles';
import { getProfileDocumentSummary } from './documents/documents.utils';

export function ProfileScreen() {
  const { width } = useWindowDimensions();
  const isCompact = width < DesignSystem.breakpoints.compact;
  const isPhone = width < DesignSystem.breakpoints.phone;
  const { isDark, setThemeMode, theme } = useAppTheme();
  const { documents, observability, presenceByUser, signOut, user } = useAppStore(
    useShallow((state) => ({
      documents: state.documents,
      observability: state.observability,
      presenceByUser: state.presenceByUser,
      signOut: state.signOut,
      user: state.user,
    }))
  );
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const styles = useMemo(() => createStyles(theme, isCompact, isPhone), [theme, isCompact, isPhone]);

  if (!user) return null;

  const roleLabel = user.accountType === 'company_owner' ? 'Propietario' : formatRole(user.role);
  const scheduleState = getOperationalScheduleState(user.operationalSchedule);
  const scheduleLabel = formatOperationalSchedule(user.operationalSchedule);
  const presence = getPresenceStatus(presenceByUser, user.id);
  const documentSummary = getProfileDocumentSummary(documents);
  const isDriver = user.role === 'driver';

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

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/perfil-editar')}
              style={styles.documentUploadButton}>
              <MaterialCommunityIcons name="account-edit-outline" size={18} color={theme.colors.accent} />
              <Text style={styles.documentUploadText}>{isDriver ? 'Editar mi perfil' : 'Editar perfil y cuenta'}</Text>
            </Pressable>
          </View>
        </AppCard>

        <View style={styles.sideColumn}>
          <AppCard>
            <View style={styles.pillsRow}>
              <Text style={styles.cardTitle}>Documentos</Text>
              {isDriver ? <StatusPill label={documentSummary} tone="info" /> : null}
            </View>
            {isDriver ? (
              <View style={styles.notificationList}>
                <Text style={styles.emptyNotifications}>Gestiona archivos, vigencias, reemplazos e historial desde una pantalla dedicada.</Text>
                <Pressable accessibilityRole="button" onPress={() => router.push('/mis-documentos')} style={styles.documentUploadButton}>
                  <MaterialCommunityIcons name="file-document-multiple-outline" size={18} color={theme.colors.accent} />
                  <Text style={styles.documentUploadText}>Administrar mis documentos</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.emptyNotifications}>La revisión administrativa de documentos se realiza en el portal web.</Text>
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
