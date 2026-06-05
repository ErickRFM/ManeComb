import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { AppCard } from '@/src/components/app-card';
import { AppShell } from '@/src/components/app-shell';
import { MetricCard } from '@/src/components/metric-card';
import { StatusPill } from '@/src/components/status-pill';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type { DashboardAlert, Vehicle } from '@/src/types/app';
import { formatStatus, formatTime } from '@/src/utils/format';

type DashboardTone = 'positive' | 'warning' | 'danger' | 'info' | 'neutral';

function getAlertTone(value: string): DashboardTone {
  const normalized = value.toLowerCase();

  if (
    normalized.includes('critical') ||
    normalized.includes('danger') ||
    normalized.includes('high')
  ) {
    return 'danger';
  }

  if (normalized.includes('warning') || normalized.includes('medium') || normalized.includes('open')) {
    return 'warning';
  }

  return 'info';
}

function getVehicleTone(status: string): DashboardTone {
  const normalized = status.toLowerCase();

  if (normalized.includes('maintenance') || normalized.includes('offline')) {
    return 'danger';
  }

  if (normalized.includes('idle') || normalized.includes('pause') || normalized.includes('delayed')) {
    return 'warning';
  }

  if (normalized.includes('route') || normalized.includes('active') || normalized.includes('ready')) {
    return 'positive';
  }

  return 'info';
}

function formatCheckpoint(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 'Ahora';
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
}

function toneColor(theme: ReturnType<typeof useAppTheme>['theme'], tone: DashboardTone) {
  if (tone === 'positive') return theme.colors.success;
  if (tone === 'warning') return theme.colors.warning;
  if (tone === 'danger') return theme.colors.danger;
  if (tone === 'neutral') return theme.colors.text;
  return theme.colors.info;
}

function toneBackground(theme: ReturnType<typeof useAppTheme>['theme'], tone: DashboardTone) {
  if (tone === 'positive') return theme.colors.successSoft;
  if (tone === 'warning') return theme.colors.warningSoft;
  if (tone === 'danger') return theme.colors.dangerSoft;
  if (tone === 'neutral') return theme.colors.surfaceAlt;
  return theme.colors.infoSoft;
}

function QuickStatCard({
  caption,
  icon,
  label,
  theme,
  tone,
  value,
}: {
  caption: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  theme: ReturnType<typeof useAppTheme>['theme'];
  tone: DashboardTone;
  value: string;
}) {
  const color = toneColor(theme, tone);
  const backgroundColor = toneBackground(theme, tone);

  return (
    <View
      style={[
        styles.quickStatCard,
        {
          backgroundColor: theme.colors.surfaceAlt,
          borderColor: theme.colors.line,
        },
      ]}>
      <View style={[styles.quickStatIcon, { backgroundColor }]}>
        <MaterialCommunityIcons name={icon} size={18} color={color} />
      </View>
      <View style={styles.quickStatCopy}>
        <Text style={[styles.quickStatLabel, { color: theme.colors.muted }]}>{label}</Text>
        <Text style={[styles.quickStatValue, { color: theme.colors.text }]}>{value}</Text>
        <Text style={[styles.quickStatCaption, { color: theme.colors.muted }]}>{caption}</Text>
      </View>
    </View>
  );
}

function DashboardButton({
  icon,
  label,
  onPress,
  theme,
  variant = 'solid',
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  theme: ReturnType<typeof useAppTheme>['theme'];
  variant?: 'solid' | 'ghost';
}) {
  const solid = variant === 'solid';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.dashboardButton,
        {
          backgroundColor: solid ? theme.colors.accent : theme.colors.surfaceAlt,
          borderColor: solid ? theme.colors.accent : theme.colors.line,
        },
        pressed ? styles.pressed : undefined,
      ]}>
      <MaterialCommunityIcons
        name={icon}
        size={18}
        color={solid ? '#FFFFFF' : theme.colors.text}
      />
      <Text
        numberOfLines={1}
        style={[
          styles.dashboardButtonLabel,
          { color: solid ? '#FFFFFF' : theme.colors.text },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function AlertRow({
  alert,
  onPress,
  theme,
}: {
  alert: DashboardAlert;
  onPress: () => void;
  theme: ReturnType<typeof useAppTheme>['theme'];
}) {
  const tone = getAlertTone(alert.tone || alert.status);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        {
          backgroundColor: theme.colors.surfaceAlt,
          borderColor: theme.colors.line,
        },
        pressed ? styles.pressed : undefined,
      ]}>
      <View style={[styles.listRowAccent, { backgroundColor: toneColor(theme, tone) }]} />
      <View style={styles.listRowCopy}>
        <View style={styles.listRowTop}>
          <Text style={[styles.listRowTitle, { color: theme.colors.text }]}>{alert.label}</Text>
          <StatusPill label={formatStatus(alert.status)} tone={tone === 'info' ? 'warning' : tone} />
        </View>
        <Text style={[styles.listRowBody, { color: theme.colors.muted }]} numberOfLines={2}>
          {alert.subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

function VehicleRow({
  theme,
  vehicle,
  onPress,
}: {
  theme: ReturnType<typeof useAppTheme>['theme'];
  vehicle: Vehicle;
  onPress: () => void;
}) {
  const tone = getVehicleTone(vehicle.status);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        {
          backgroundColor: theme.colors.surfaceAlt,
          borderColor: theme.colors.line,
        },
        pressed ? styles.pressed : undefined,
      ]}>
      <View style={[styles.listRowAccent, { backgroundColor: toneColor(theme, tone) }]} />
      <View style={styles.listRowCopy}>
        <View style={styles.listRowTop}>
          <View style={styles.vehicleTitleRow}>
            <MaterialCommunityIcons name="bus" size={16} color={theme.colors.accent} />
            <Text style={[styles.listRowTitle, { color: theme.colors.text }]}>{vehicle.code}</Text>
          </View>
          <StatusPill
            label={formatStatus(vehicle.status)}
            tone={tone === 'neutral' ? 'info' : tone}
          />
        </View>
        <Text style={[styles.listRowBody, { color: theme.colors.muted }]} numberOfLines={1}>
          {vehicle.driverName || 'Sin chofer'} | {vehicle.routeName || 'Sin ruta'}
        </Text>
        <View style={styles.vehicleMetaRow}>
          <Text style={[styles.vehicleMetaPoint, { color: theme.colors.text }]}>
            Aforo {vehicle.occupancy}%
          </Text>
          <Text style={[styles.vehicleMetaPoint, { color: theme.colors.text }]}>
            ETA {vehicle.etaMinutes || 0} min
          </Text>
          <Text style={[styles.vehicleMetaPoint, { color: theme.colors.text }]}>
            Vel {vehicle.speed} km/h
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function ActionTile({
  description,
  icon,
  label,
  onPress,
  theme,
  tone,
}: {
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  theme: ReturnType<typeof useAppTheme>['theme'];
  tone: DashboardTone;
}) {
  const color = toneColor(theme, tone);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionTile,
        {
          backgroundColor: theme.colors.surfaceAlt,
          borderColor: theme.colors.line,
        },
        pressed ? styles.pressed : undefined,
      ]}>
      <View style={[styles.actionTileIcon, { backgroundColor: toneBackground(theme, tone) }]}>
        <MaterialCommunityIcons name={icon} size={18} color={color} />
      </View>
      <View style={styles.actionTileCopy}>
        <Text style={[styles.actionTileTitle, { color: theme.colors.text }]} numberOfLines={1}>{label}</Text>
        <Text style={[styles.actionTileBody, { color: theme.colors.muted }]} numberOfLines={2}>{description}</Text>
      </View>
    </Pressable>
  );
}

export function DashboardScreen() {
  const { theme } = useAppTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 1120;
  const {
    dashboard,
    error,
    isRefreshing,
    refreshAll,
    setFocusedIncidentId,
    user,
  } = useAppStore(
    useShallow((state) => ({
      dashboard: state.dashboard,
      error: state.error,
      isRefreshing: state.isRefreshing,
      refreshAll: state.refreshAll,
      setFocusedIncidentId: state.setFocusedIncidentId,
      user: state.user,
    }))
  );

  const onRouteValue =
    dashboard?.metrics.find((metric) => metric.id === 'units-on-route')?.value ||
    String(dashboard?.fleet.length || 0);
  const unreadNotifications =
    dashboard?.notifications.filter((notification) => !notification.isRead).length ||
    dashboard?.notifications.length ||
    0;
  const healthyUnits =
    dashboard?.fleet.filter((vehicle) => !vehicle.status.toLowerCase().includes('maintenance'))
      .length || 0;
  const recentVehicles = isCompact ? dashboard?.fleet.slice(0, 6) || [] : dashboard?.fleet || [];
  const quickActions = user
    ? [
        {
          description: 'Rutas, unidades y operadores.',
          icon: 'map-marker-radius' as const,
          id: 'mapa',
          label: 'Mapa en vivo',
          onPress: () => router.push('/mapa'),
          tone: 'info' as DashboardTone,
        },
        {
          description: 'Incidencias pendientes del turno.',
          icon: 'alert-octagon-outline' as const,
          id: 'incidencias',
          label: 'Centro de alertas',
          onPress: () => router.push('/incidencias'),
          tone: dashboard?.alerts.length ? ('danger' as DashboardTone) : ('warning' as DashboardTone),
        },
        user.role === 'admin'
          ? {
              description: 'Gestionar roles, cuentas y cobertura operativa.',
              icon: 'account-group-outline' as const,
              id: 'usuarios',
              label: 'Usuarios y roles',
              onPress: () => router.push('/usuarios'),
              tone: 'neutral' as DashboardTone,
            }
          : {
              description: 'Datos, foto y documentos.',
              icon: 'account-circle-outline' as const,
              id: 'perfil',
              label: 'Mi perfil',
              onPress: () => router.push('/perfil'),
              tone: 'neutral' as DashboardTone,
            },
      ]
    : [];

  if (!user || !dashboard) {
    return (
      <AppShell mobileTitle="Panel">
        <View style={styles.loaderState}>
          <ActivityIndicator color={theme.colors.accent} size="large" />
          <Text style={[styles.loaderTitle, { color: theme.colors.text }]}>Sincronizando panel</Text>
          <Text style={[styles.loaderBody, { color: theme.colors.muted }]}>
            Estamos preparando rutas, alertas y actividad del turno actual.
          </Text>
        </View>
      </AppShell>
    );
  }

  const handleAlertPress = (alertId: string) => {
    setFocusedIncidentId(alertId);
    router.push('/incidencias');
  };

  const handleVehiclePress = (vehicleId: string) => {
    router.push({ pathname: '/mapa', params: { vehicleId, follow: 'true' } });
  };

  return (
    <AppShell
      onRefresh={refreshAll}
      refreshing={isRefreshing}
      mobileTitle="Panel"
      mobileBadges={[
        {
          label: `${dashboard.alerts.length} alertas`,
          tone: dashboard.alerts.length ? 'danger' : 'positive',
        },
        {
          label: dashboard.shift.label,
          tone: 'info',
        },
      ]}>
      <View style={styles.page}>
        {error ? (
          <View
            style={[
              styles.errorBanner,
              {
                backgroundColor: theme.colors.dangerSoft,
                borderColor: theme.colors.danger,
              },
            ]}>
            <Text style={[styles.errorBannerText, { color: theme.colors.danger }]}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.headerStack}>
          <View style={styles.quickStatsRow}>
          <QuickStatCard
              caption="Unidades en seguimiento"
              icon="bus-clock"
              label="En ruta"
              theme={theme}
              tone="info"
              value={onRouteValue}
            />
          <QuickStatCard
              caption="Requieren atencion"
              icon="alert-decagram"
              label="Alertas"
              theme={theme}
              tone={dashboard.alerts.length ? 'danger' : 'positive'}
              value={String(dashboard.alerts.length)}
            />
          <QuickStatCard
              caption="Flotilla disponible"
              icon="shield-check-outline"
              label="Estables"
              theme={theme}
              tone="positive"
              value={String(healthyUnits)}
            />
          <QuickStatCard
              caption="Proximo control"
              icon="timer-sand"
              label="Checkpoint"
              theme={theme}
              tone="warning"
              value={formatCheckpoint(dashboard.shift.nextCheckpointInMinutes)}
            />
          </View>

          <AppCard
            style={[
              styles.heroCard,
              {
                backgroundColor: theme.colors.cardSoft,
                borderColor: theme.colors.lineStrong,
              },
            ]}>
            <View style={[styles.heroLayout, isCompact ? styles.heroLayoutCompact : undefined]}>
              <View style={styles.heroCopy}>
                <Text style={[styles.heroEyebrow, { color: theme.colors.accent }]}>
                  {dashboard.hero.eyebrow}
                </Text>
                <Text style={[styles.heroTitle, { color: theme.colors.text }]}>
                  {dashboard.hero.title}
                </Text>
                <Text style={[styles.heroBody, { color: theme.colors.muted }]}>
                  {dashboard.hero.description}
                </Text>

                <View style={styles.heroMetaRow}>
                  <StatusPill label={dashboard.shift.label} tone="info" />
                  <StatusPill
                    label={`${dashboard.fleet.length} unidades`}
                    tone="neutral"
                  />
                  <StatusPill
                    label={`${dashboard.alerts.length} alertas`}
                    tone={dashboard.alerts.length ? 'danger' : 'positive'}
                  />
                </View>
              </View>

              <View style={styles.heroSide}>
                <View
                  style={[
                    styles.heroInfoCard,
                    {
                      backgroundColor: theme.colors.surfaceAlt,
                      borderColor: theme.colors.line,
                    },
                  ]}>
                  <View style={styles.heroInfoGrid}>
                    <View style={styles.heroInfoItem}>
                      <Text style={[styles.heroInfoLabel, { color: theme.colors.muted }]}>Turno</Text>
                      <Text style={[styles.heroInfoValue, { color: theme.colors.text }]}>
                        {dashboard.shift.label}
                      </Text>
                    </View>
                    <View style={styles.heroInfoItem}>
                      <Text style={[styles.heroInfoLabel, { color: theme.colors.muted }]}>Inicio</Text>
                      <Text style={[styles.heroInfoValue, { color: theme.colors.text }]}>
                        {formatTime(dashboard.shift.startedAt)}
                      </Text>
                    </View>
                    <View style={styles.heroInfoItem}>
                      <Text style={[styles.heroInfoLabel, { color: theme.colors.muted }]}>
                        Siguiente control
                      </Text>
                      <Text style={[styles.heroInfoValue, { color: theme.colors.text }]}>
                        {formatCheckpoint(dashboard.shift.nextCheckpointInMinutes)}
                      </Text>
                    </View>
                    <View style={styles.heroInfoItem}>
                      <Text style={[styles.heroInfoLabel, { color: theme.colors.muted }]}>
                        Notificaciones
                      </Text>
                      <Text style={[styles.heroInfoValue, { color: theme.colors.text }]}>
                        {unreadNotifications}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.heroButtonRow}>
                  <DashboardButton
                    icon="map-marker-radius"
                    label="Ver mapa"
                    onPress={() => router.push('/mapa')}
                    theme={theme}
                  />
                  <DashboardButton
                    icon="alert-outline"
                    label="Ver alertas"
                    onPress={() => router.push('/incidencias')}
                    theme={theme}
                    variant="ghost"
                  />
                </View>
              </View>
            </View>
          </AppCard>
        </View>

        <View style={styles.metricsGrid}>
          {dashboard.metrics.map((metric) => (
            <MetricCard
              key={metric.id}
              label={metric.label}
              value={metric.value}
              trend={metric.trend}
              tone={metric.tone}
            />
          ))}
        </View>

        <View style={[styles.mainGrid, isCompact ? styles.mainGridCompact : undefined]}>
          <View style={styles.primaryColumn}>
            <AppCard
              style={[
                styles.sectionCard,
                {
                  backgroundColor: theme.colors.card,
                },
              ]}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeading}>
                  <Text style={[styles.sectionEyebrow, { color: theme.colors.accent }]}>
                    PRIORIDAD
                  </Text>
                  <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                    Alertas criticas
                  </Text>
                </View>
                <DashboardButton
                  icon="alert-octagon-outline"
                  label="Abrir"
                  onPress={() => router.push('/incidencias')}
                  theme={theme}
                  variant="ghost"
                />
              </View>

              <View style={styles.listStack}>
                {dashboard.alerts.length ? (
                  dashboard.alerts.map((alert) => (
                    <AlertRow
                      key={alert.id}
                      alert={alert}
                      onPress={() => handleAlertPress(alert.id)}
                      theme={theme}
                    />
                  ))
                ) : (
                  <View
                    style={[
                      styles.emptyState,
                      {
                        backgroundColor: theme.colors.surfaceAlt,
                        borderColor: theme.colors.line,
                      },
                    ]}>
                    <MaterialCommunityIcons
                      name="shield-check-outline"
                      size={26}
                      color={theme.colors.success}
                    />
                    <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                      Operacion estable
                    </Text>
                    <Text style={[styles.emptyBody, { color: theme.colors.muted }]}>
                      No hay incidencias criticas pendientes en este momento.
                    </Text>
                  </View>
                )}
              </View>
            </AppCard>

            <AppCard
              style={[
                styles.sectionCard,
                {
                  backgroundColor: theme.colors.card,
                },
              ]}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeading}>
                  <Text style={[styles.sectionEyebrow, { color: theme.colors.info }]}>
                    FLOTA
                  </Text>
                  <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                    Seguimiento de unidades
                  </Text>
                </View>
                <DashboardButton
                  icon="crosshairs-gps"
                  label="Mapa"
                  onPress={() => router.push('/mapa')}
                  theme={theme}
                  variant="ghost"
                />
              </View>

              {isCompact ? (
                <View style={styles.listStack}>
                  {recentVehicles.map((vehicle) => (
                    <VehicleRow
                      key={vehicle.id}
                      theme={theme}
                      vehicle={vehicle}
                      onPress={() => handleVehiclePress(vehicle.id)}
                    />
                  ))}
                </View>
              ) : (
                <ScrollView
                  style={styles.fleetScroll}
                  showsVerticalScrollIndicator={Platform.OS === 'web'}>
                  <View style={styles.listStack}>
                    {recentVehicles.map((vehicle) => (
                      <VehicleRow
                        key={vehicle.id}
                        theme={theme}
                        vehicle={vehicle}
                        onPress={() => handleVehiclePress(vehicle.id)}
                      />
                    ))}
                  </View>
                </ScrollView>
              )}
            </AppCard>
          </View>

          <View style={styles.sideColumn}>
            <AppCard
              style={[
                styles.sectionCard,
                {
                  backgroundColor: theme.colors.card,
                },
              ]}>
              <View style={styles.sectionHeading}>
                <Text style={[styles.sectionEyebrow, { color: theme.colors.warning }]}>TURNO</Text>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  Pulso operativo
                </Text>
              </View>

              <View style={styles.pulseGrid}>
                <View
                  style={[
                    styles.pulseCard,
                    {
                      backgroundColor: theme.colors.surfaceAlt,
                      borderColor: theme.colors.line,
                    },
                  ]}>
                  <Text style={[styles.pulseLabel, { color: theme.colors.muted }]}>Inicio</Text>
                  <Text style={[styles.pulseValue, { color: theme.colors.text }]}>
                    {formatTime(dashboard.shift.startedAt)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.pulseCard,
                    {
                      backgroundColor: theme.colors.surfaceAlt,
                      borderColor: theme.colors.line,
                    },
                  ]}>
                  <Text style={[styles.pulseLabel, { color: theme.colors.muted }]}>
                    Siguiente control
                  </Text>
                  <Text style={[styles.pulseValue, { color: theme.colors.text }]}>
                    {formatCheckpoint(dashboard.shift.nextCheckpointInMinutes)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.pulseCard,
                    {
                      backgroundColor: theme.colors.surfaceAlt,
                      borderColor: theme.colors.line,
                    },
                  ]}>
                  <Text style={[styles.pulseLabel, { color: theme.colors.muted }]}>Alertas</Text>
                  <Text style={[styles.pulseValue, { color: theme.colors.text }]}>
                    {dashboard.alerts.length}
                  </Text>
                </View>
                <View
                  style={[
                    styles.pulseCard,
                    {
                      backgroundColor: theme.colors.surfaceAlt,
                      borderColor: theme.colors.line,
                    },
                  ]}>
                  <Text style={[styles.pulseLabel, { color: theme.colors.muted }]}>
                    Notificaciones
                  </Text>
                  <Text style={[styles.pulseValue, { color: theme.colors.text }]}>
                    {unreadNotifications}
                  </Text>
                </View>
              </View>

              <View style={styles.notificationStack}>
                {dashboard.notifications.slice(0, 3).map((notification) => (
                  <View
                    key={notification.id}
                    style={[
                      styles.notificationRow,
                      {
                        backgroundColor: theme.colors.surfaceAlt,
                        borderColor: theme.colors.line,
                      },
                    ]}>
                    <MaterialCommunityIcons
                      name="bell-ring-outline"
                      size={16}
                      color={theme.colors.info}
                    />
                    <View style={styles.notificationCopy}>
                      <Text style={[styles.notificationTitle, { color: theme.colors.text }]}>
                        {notification.title}
                      </Text>
                      <Text
                        style={[styles.notificationBody, { color: theme.colors.muted }]}
                        numberOfLines={2}>
                        {notification.body}
                      </Text>
                    </View>
                  </View>
                ))}
                {!dashboard.notifications.length ? (
                  <Text style={[styles.notificationEmpty, { color: theme.colors.muted }]}>
                    Sin mensajes nuevos en este turno.
                  </Text>
                ) : null}
              </View>
            </AppCard>

            <AppCard
              style={[
                styles.sectionCard,
                {
                  backgroundColor: theme.colors.card,
                },
              ]}>
              <View style={styles.sectionHeading}>
                <Text style={[styles.sectionEyebrow, { color: theme.colors.success }]}>
                  ACCIONES
                </Text>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  Accesos rapidos
                </Text>
              </View>

              <View style={styles.actionStack}>
                {quickActions.map((action) => (
                  <ActionTile
                    key={action.id}
                    description={action.description}
                    icon={action.icon}
                    label={action.label}
                    onPress={action.onPress}
                    theme={theme}
                    tone={action.tone}
                  />
                ))}
              </View>
            </AppCard>
          </View>
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: AppTheme.spacing.md,
  },
  loaderState: {
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: AppTheme.spacing.xl,
  },
  loaderTitle: {
    fontFamily: Typography.display,
    fontSize: 28,
    fontWeight: '900',
  },
  loaderBody: {
    fontFamily: Typography.body,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 420,
  },
  errorBanner: {
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorBannerText: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
  },
  headerStack: {
    gap: AppTheme.spacing.md,
  },
  quickStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickStatCard: {
    flex: 1,
    minWidth: 220,
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    padding: 13,
    flexDirection: 'row',
    gap: 12,
  },
  quickStatIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickStatCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  quickStatLabel: {
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  quickStatValue: {
    fontFamily: Typography.display,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
  },
  quickStatCaption: {
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 17,
  },
  heroCard: {
    overflow: 'hidden',
  },
  heroLayout: {
    flexDirection: 'row',
    gap: AppTheme.spacing.md,
    alignItems: 'stretch',
  },
  heroLayoutCompact: {
    flexDirection: 'column',
  },
  heroCopy: {
    flex: 1.2,
    minWidth: 0,
    gap: 8,
  },
  heroEyebrow: {
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontFamily: Typography.display,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
  },
  heroBody: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
    maxWidth: 620,
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  heroSide: {
    flex: 0.95,
    minWidth: 0,
    gap: 12,
  },
  heroInfoCard: {
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    padding: 13,
  },
  heroInfoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  heroInfoItem: {
    flex: 1,
    minWidth: 130,
    gap: 4,
  },
  heroInfoLabel: {
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  heroInfoValue: {
    fontFamily: Typography.display,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
  },
  heroButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dashboardButton: {
    minHeight: 40,
    flexShrink: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dashboardButtonLabel: {
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
    minWidth: 0,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  mainGrid: {
    flexDirection: 'row',
    gap: AppTheme.spacing.sm,
    alignItems: 'flex-start',
  },
  mainGridCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  primaryColumn: {
    flex: 1.35,
    minWidth: 0,
    gap: AppTheme.spacing.sm,
  },
  sideColumn: {
    flex: 0.95,
    minWidth: 0,
    gap: AppTheme.spacing.sm,
  },
  sectionCard: {
    gap: AppTheme.spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    flexWrap: 'wrap',
  },
  sectionHeading: {
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  sectionEyebrow: {
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontFamily: Typography.display,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
  },
  listStack: {
    gap: 10,
  },
  listRow: {
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
  },
  listRowAccent: {
    width: 4,
    borderRadius: 999,
  },
  listRowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  listRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    flexWrap: 'wrap',
  },
  listRowTitle: {
    fontFamily: Typography.body,
    fontSize: 15,
    fontWeight: '900',
  },
  listRowBody: {
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  vehicleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vehicleMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 2,
  },
  vehicleMetaPoint: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
  fleetScroll: {
    maxHeight: 470,
  },
  emptyState: {
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: Typography.display,
    fontSize: 22,
    fontWeight: '900',
  },
  emptyBody: {
    fontFamily: Typography.body,
    fontSize: 13.5,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 320,
  },
  pulseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pulseCard: {
    flex: 1,
    minWidth: 140,
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  pulseLabel: {
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  pulseValue: {
    fontFamily: Typography.display,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
  },
  notificationStack: {
    gap: 10,
  },
  notificationRow: {
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  notificationCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  notificationTitle: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  notificationBody: {
    fontFamily: Typography.body,
    fontSize: 12.5,
    lineHeight: 18,
  },
  notificationEmpty: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
  },
  actionStack: {
    gap: 10,
  },
  actionTile: {
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
  },
  actionTileIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTileCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  actionTileTitle: {
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
    minWidth: 0,
  },
  actionTileBody: {
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 12.5,
    lineHeight: 18,
    minWidth: 0,
  },
  pressed: {
    opacity: 0.92,
  },
});
