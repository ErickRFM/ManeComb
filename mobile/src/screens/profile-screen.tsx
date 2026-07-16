import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
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

function createStyles(theme: ReturnType<typeof useAppTheme>['theme'], isCompact: boolean, isPhone: boolean) {
  return StyleSheet.create({
    header: {
      gap: 8,
      paddingTop: isPhone ? AppTheme.spacing.sm : AppTheme.spacing.md,
    },
    title: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: isPhone ? 26 : 32,
      fontWeight: '900',
    },
    mainGrid: {
      flexDirection: Platform.OS === 'web' && !isCompact ? 'row' : 'column',
      gap: AppTheme.spacing.md,
      alignItems: 'stretch',
      width: '100%',
    },
    identityBlock: {
      gap: 14,
      maxWidth: 680,
      zIndex: 2,
    },
    profileTop: {
      alignItems: isPhone ? 'flex-start' : 'center',
      flexDirection: isPhone ? 'column' : 'row',
      gap: 14,
    },
    avatarBox: {
      borderColor: theme.colors.accent,
      borderRadius: 66,
      borderWidth: 2,
      padding: 5,
    },
    profileCopy: {
      flex: 1,
      minWidth: 0,
      gap: 8,
    },
    userName: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: isPhone ? 24 : 31,
      fontWeight: '900',
      letterSpacing: -0.8,
    },
    pillsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    sideColumn: {
      flex: 0.92,
      gap: AppTheme.spacing.md,
      width: isCompact ? '100%' : undefined,
      minWidth: isPhone ? 0 : 340,
    },
    cardTitle: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 20,
      fontWeight: '900',
    },
    infoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    infoTile: {
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: theme.colors.line,
      borderRadius: 18,
      borderWidth: 1,
      flex: 1,
      gap: 8,
      minWidth: isPhone ? '100%' : 220,
      padding: 13,
      zIndex: 2,
    },
    infoIcon: {
      alignItems: 'center',
      backgroundColor: theme.colors.accentSoft,
      borderRadius: 14,
      height: 42,
      justifyContent: 'center',
      width: 42,
    },
    infoLabel: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    infoValue: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 14,
      fontWeight: '800',
      lineHeight: 21,
      flexShrink: 1,
    },
    themeRow: {
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.line,
      borderRadius: 16,
      flexDirection: 'row',
      gap: 8,
      padding: 6,
    },
    themeTab: {
      alignItems: 'center',
      borderColor: 'transparent',
      borderRadius: 13,
      borderWidth: 1,
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      height: 42,
      justifyContent: 'center',
    },
    themeTabText: {
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '900',
    },
    sessionCard: {
      backgroundColor: theme.colors.cardSoft,
      borderColor: theme.colors.line,
    },
    notificationList: {
      gap: 8,
    },
    notificationRow: {
      minHeight: 58,
      borderRadius: 14,
      borderWidth: 1,
      padding: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    notificationIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notificationCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    notificationTitle: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '900',
    },
    notificationBody: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 17,
    },
    emptyNotifications: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 13,
      lineHeight: 19,
    },
    logoutBtn: {
      alignItems: 'center',
      borderColor: theme.colors.accent,
      borderRadius: 14,
      borderWidth: 1.5,
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'center',
      minHeight: 46,
    },
    logoutText: {
      color: theme.colors.accent,
      fontFamily: Typography.body,
      fontSize: 14,
      fontWeight: '900',
    },
  });
}

function InfoTile({
  icon,
  label,
  value,
  styles,
  theme,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
  theme: ReturnType<typeof useAppTheme>['theme'];
}) {
  return (
    <View style={styles.infoTile}>
      <View style={styles.infoIcon}>
        <MaterialCommunityIcons name={icon} size={20} color={theme.colors.accent} />
      </View>
      <View>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export function ProfileScreen() {
  const { width } = useWindowDimensions();
  const isCompact = width < 1040;
  const isPhone = width < 640;
  const { isDark, setThemeMode, theme } = useAppTheme();
  const { documents, markNotificationRead, notifications, observability, presenceByUser, signOut, user } = useAppStore(
    useShallow((state) => ({
      documents: state.documents,
      markNotificationRead: state.markNotificationRead,
      notifications: state.notifications,
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
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;
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
              <Text style={styles.cardTitle}>Documentos</Text>
              {documents.length ? <StatusPill label={`${documents.length}`} tone="info" /> : null}
            </View>
            {documents.length ? (
              <View style={styles.notificationList}>
                {documents.map((document) => {
                  const reviewLabel = document.reviewStatus === 'approved'
                    ? 'Aprobado'
                    : document.reviewStatus === 'rejected'
                      ? 'Rechazado'
                      : 'Pendiente';
                  const reviewTone = document.reviewStatus === 'approved'
                    ? 'positive' as const
                    : document.reviewStatus === 'rejected'
                      ? 'danger' as const
                      : 'warning' as const;
                  const ownerLabel = document.owner && 'name' in document.owner
                    ? document.owner.name
                    : document.owner && 'code' in document.owner
                      ? document.owner.code
                      : document.ownerType === 'vehicle' ? 'Unidad asociada' : 'Conductor asociado';
                  return (
                    <View key={document.id} style={[styles.notificationRow, { borderColor: theme.colors.line, backgroundColor: theme.colors.surfaceAlt }]}>
                      <View style={[styles.notificationIcon, { backgroundColor: theme.colors.infoSoft }]}>
                        <MaterialCommunityIcons name="file-document-outline" size={19} color={theme.colors.info} />
                      </View>
                      <View style={styles.notificationCopy}>
                        <Text style={styles.notificationTitle}>{document.name}</Text>
                        <Text style={styles.notificationBody}>
                          {document.category} Â· {ownerLabel} Â· {document.status} Â· Vence {new Date(document.expiresAt).toLocaleDateString('es-MX')}
                        </Text>
                        {document.reviewNotes ? <Text style={styles.notificationBody}>{document.reviewNotes}</Text> : null}
                      </View>
                      <StatusPill label={reviewLabel} tone={reviewTone} />
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.emptyNotifications}>No hay documentos asociados a tu cuenta o unidad.</Text>
            )}
          </AppCard>

          <AppCard>
            <View style={styles.pillsRow}>
              <Text style={styles.cardTitle}>Notificaciones</Text>
              {unreadCount ? <StatusPill label={`${unreadCount} sin leer`} tone="warning" /> : null}
            </View>
            {notifications.length ? (
              <View style={styles.notificationList}>
                {notifications.map((notification) => {
                  const isDanger = notification.level === 'danger' || notification.level === 'error';
                  const color = isDanger ? theme.colors.danger : notification.level === 'warning' ? theme.colors.warning : theme.colors.info;
                  return (
                    <Pressable
                      key={notification.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${notification.isRead ? 'NotificaciÃ³n leÃ­da' : 'Marcar como leÃ­da'}: ${notification.title}`}
                      disabled={notification.isRead}
                      onPress={async () => {
                        await markNotificationRead(notification.id);
                      }}
                      style={[
                        styles.notificationRow,
                        { borderColor: notification.isRead ? theme.colors.line : color, backgroundColor: theme.colors.surfaceAlt },
                      ]}>
                      <View style={[styles.notificationIcon, { backgroundColor: isDanger ? theme.colors.dangerSoft : notification.level === 'warning' ? theme.colors.warningSoft : theme.colors.infoSoft }]}>
                        <MaterialCommunityIcons name={notification.isRead ? 'bell-outline' : 'bell-badge-outline'} size={19} color={color} />
                      </View>
                      <View style={styles.notificationCopy}>
                        <Text style={styles.notificationTitle}>{notification.title}</Text>
                        <Text style={styles.notificationBody}>{notification.body}</Text>
                        <Text style={styles.notificationBody}>
                          {[notification.category, new Date(notification.createdAt).toLocaleString('es-MX')].filter(Boolean).join(' Â· ')}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.emptyNotifications}>No hay notificaciones pendientes.</Text>
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
                <InfoTile icon="alert-decagram-outline" label="Incidencias crÃ­ticas" value={String(observability.activeCriticalIncidents)} styles={styles} theme={theme} />
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
                        <Text style={styles.notificationBody}>{event.scope} Â· {new Date(event.createdAt).toLocaleString('es-MX')}</Text>
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
