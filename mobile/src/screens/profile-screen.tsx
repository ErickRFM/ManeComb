import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Image } from '@/src/native/image';
import { router } from '@/src/navigation/router';
import { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { AppCard } from '@/src/components/app-card';
import { AppShell } from '@/src/components/app-shell';
import { BrandLogo } from '@/src/components/brand-logo';
import { StatusPill } from '@/src/components/status-pill';
import { UserAvatar } from '@/src/components/user-avatar';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import { formatRole, formatStatus } from '@/src/utils/format';
import {
  formatOperationalSchedule,
  getOperationalScheduleState,
} from '@/src/utils/operational-schedule';

const fasterArtwork = require('../../assets/images/faster.png');

type ActionItem = {
  id: string;
  label: string;
  helper: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  href: string;
  tone: 'accent' | 'info' | 'success' | 'warning';
};

function createStyles(theme: ReturnType<typeof useAppTheme>['theme'], isCompact: boolean, isPhone: boolean) {
  return StyleSheet.create({
    header: {
      gap: 8,
      paddingTop: isPhone ? AppTheme.spacing.sm : AppTheme.spacing.md,
    },
    eyebrow: {
      color: theme.colors.accent,
      fontFamily: Typography.body,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.6,
    },
    title: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: isPhone ? 26 : 32,
      fontWeight: '900',
    },
    subtitle: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 14,
      lineHeight: 22,
      maxWidth: 760,
    },
    mainGrid: {
      flexDirection: Platform.OS === 'web' && !isCompact ? 'row' : 'column',
      gap: AppTheme.spacing.md,
      alignItems: 'stretch',
      width: '100%',
    },
    heroCard: {
      flex: 1.35,
      minHeight: isPhone ? 360 : 410,
      minWidth: 0,
      borderRadius: 26,
      overflow: 'hidden',
      padding: isPhone ? 16 : 22,
      gap: 16,
      justifyContent: 'space-between',
    },
    heroGlow: {
      position: 'absolute',
      top: -90,
      right: 18,
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: theme.colors.accentSoft,
    },
    heroVehicle: {
      position: 'absolute',
      right: isPhone ? -54 : 18,
      top: isPhone ? 126 : 116,
      width: isPhone ? 310 : 360,
      height: isPhone ? 196 : 228,
      opacity: theme.mode === 'dark' ? 0.22 : 0.16,
      zIndex: 0,
    },
    brandRow: {
      alignItems: 'flex-start',
      gap: 10,
      zIndex: 2,
    },
    heroSummaryCard: {
      maxWidth: 380,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      padding: 13,
      gap: 5,
      zIndex: 2,
    },
    heroSummaryEyebrow: {
      color: theme.colors.accent,
      fontFamily: Typography.body,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    heroSummaryTitle: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 18,
      fontWeight: '900',
    },
    heroSummaryBody: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 18,
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
    userEmail: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 14,
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
    cardSubtitle: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 13,
      lineHeight: 20,
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
    actionsGrid: {
      gap: 12,
    },
    actionCard: {
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceAlt,
      borderColor: theme.colors.line,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      padding: 12,
    },
    actionIcon: {
      alignItems: 'center',
      borderRadius: 15,
      height: 42,
      justifyContent: 'center',
      width: 46,
    },
    actionCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    actionLabel: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 15,
      fontWeight: '900',
    },
    actionHelper: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      lineHeight: 18,
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

function getToneColor(theme: ReturnType<typeof useAppTheme>['theme'], tone: ActionItem['tone']) {
  if (tone === 'info') return theme.colors.info;
  if (tone === 'success') return theme.colors.success;
  if (tone === 'warning') return theme.colors.warning;
  return theme.colors.accent;
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
  const { notifications, signOut, user } = useAppStore(
    useShallow((state) => ({
      notifications: state.notifications,
      signOut: state.signOut,
      user: state.user,
    }))
  );

  const styles = useMemo(() => createStyles(theme, isCompact, isPhone), [theme, isCompact, isPhone]);

  if (!user) return null;

  const pendingNotifications = notifications.filter((notification) => !notification.isRead).length;
  const roleLabel = user.accountType === 'company_owner' ? 'Propietario' : formatRole(user.role);
  const scheduleState = getOperationalScheduleState(user.operationalSchedule);
  const scheduleLabel = formatOperationalSchedule(user.operationalSchedule);
  const actions: ActionItem[] = [
    {
      id: 'edit',
      label: 'Editar perfil',
      helper: 'Datos personales, foto y contacto.',
      icon: 'account-edit-outline',
      href: '/perfil-editar',
      tone: 'accent',
    },
    {
      id: 'security',
      label: 'Seguridad',
      helper: 'Acceso, contrasena y dispositivos.',
      icon: 'shield-lock-outline',
      href: '/perfil-editar?section=access',
      tone: 'success',
    },
    {
      id: 'billing',
      label: user.accountType === 'company_owner' ? 'Facturacion' : 'Preferencias',
      helper: user.accountType === 'company_owner' ? 'RFC, razon social y pagos.' : 'Ajustes de cuenta operativa.',
      icon: user.accountType === 'company_owner' ? 'credit-card-outline' : 'tune-variant',
      href: user.accountType === 'company_owner' ? '/perfil-editar?section=billing' : '/perfil-editar',
      tone: 'warning',
    },
  ];

  return (
    <AppShell
      scroll
      sectionKey="perfil"
      mobileTitle="Perfil"
      mobileSubtitle="Cuenta, seguridad y apariencia."
      mobileBadges={[
        { label: roleLabel, tone: 'info' },
        {
          label: pendingNotifications ? `${pendingNotifications} avisos` : 'Sincronizado',
          tone: pendingNotifications ? 'warning' : 'positive',
        },
      ]}
      header={
        <View style={styles.header}>
          <Text style={styles.eyebrow}>CUENTA OPERATIVA</Text>
          <Text style={styles.title}>Perfil y preferencias</Text>
          <Text style={styles.subtitle}>
            Administra identidad, acceso y apariencia.
          </Text>
        </View>
      }>
      <View style={styles.mainGrid}>
        <AppCard style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <Image source={fasterArtwork} style={styles.heroVehicle} contentFit="contain" />
          <View style={styles.brandRow}>
            <BrandLogo size={isPhone ? 'sm' : 'md'} subtitle="Centro ManeComb" />
            <View style={styles.heroSummaryCard}>
              <Text style={styles.heroSummaryEyebrow}>Panel personal</Text>
              <Text style={styles.heroSummaryTitle}>Identidad operativa.</Text>
              <Text style={styles.heroSummaryBody}>
                Contacto, rol, estado y accesos.
              </Text>
            </View>
          </View>

          <View style={styles.identityBlock}>
            <View style={styles.profileTop}>
              <View style={styles.avatarBox}>
                <UserAvatar user={user} status={user.status} showStatus size={112} />
              </View>
              <View style={styles.profileCopy}>
                <Text style={styles.userName}>{user.name}</Text>
                <Text style={styles.userEmail}>{user.email}</Text>
                <View style={styles.pillsRow}>
                  <StatusPill label={roleLabel} tone="info" />
                  <StatusPill label={formatStatus(user.status)} tone={user.status === 'offline' ? 'neutral' : 'positive'} />
                  <StatusPill
                    label={pendingNotifications ? `${pendingNotifications} avisos` : 'Sincronizado'}
                    tone={pendingNotifications ? 'warning' : 'positive'}
                  />
                </View>
              </View>
            </View>

            <View style={styles.infoGrid}>
              <InfoTile icon="email-outline" label="Correo" value={user.email} styles={styles} theme={theme} />
              <InfoTile icon="phone-outline" label="Telefono" value={user.phone || 'Pendiente'} styles={styles} theme={theme} />
              <InfoTile icon="clock-outline" label="Turno" value={user.shift || 'Control de flota'} styles={styles} theme={theme} />
              <InfoTile icon="calendar-clock" label="Horario" value={`${scheduleLabel} - ${scheduleState.label}`} styles={styles} theme={theme} />
              <InfoTile icon="account-key-outline" label="Rol" value={roleLabel} styles={styles} theme={theme} />
            </View>
          </View>
        </AppCard>

        <View style={styles.sideColumn}>
          <AppCard>
            <Text style={styles.cardTitle}>Acciones</Text>
            <Text style={styles.cardSubtitle}>Atajos importantes.</Text>
            <View style={styles.actionsGrid}>
              {actions.map((action) => {
                const color = getToneColor(theme, action.tone);

                return (
                  <Pressable
                    key={action.id}
                    onPress={() => router.push(action.href as any)}
                    style={({ pressed }) => [styles.actionCard, pressed ? { opacity: 0.78 } : undefined]}>
                    <View style={[styles.actionIcon, { backgroundColor: `${color}1F` }]}>
                      <MaterialCommunityIcons name={action.icon} size={22} color={color} />
                    </View>
                    <View style={styles.actionCopy}>
                      <Text style={styles.actionLabel}>{action.label}</Text>
                      <Text style={styles.actionHelper}>{action.helper}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.muted} />
                  </Pressable>
                );
              })}
            </View>
          </AppCard>

          <AppCard>
            <Text style={styles.cardTitle}>Apariencia</Text>
            <Text style={styles.cardSubtitle}>Interfaz consistente entre web y movil.</Text>
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

          <AppCard style={styles.sessionCard}>
            <Text style={styles.cardTitle}>Sesion</Text>
            <Text style={styles.cardSubtitle}>Cierra el acceso actual.</Text>
            <Pressable
              onPress={() => {
                signOut().finally(() => router.replace('/login'));
              }}
              style={styles.logoutBtn}>
              <MaterialCommunityIcons name="logout" size={18} color={theme.colors.accent} />
              <Text style={styles.logoutText}>Cerrar sesion</Text>
            </Pressable>
          </AppCard>
        </View>
      </View>
    </AppShell>
  );
}
