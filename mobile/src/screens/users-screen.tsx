import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { AppCard } from '@/src/components/app-card';
import { AppShell } from '@/src/components/app-shell';
import { StatusPill } from '@/src/components/status-pill';
import { UserAvatar } from '@/src/components/user-avatar';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type { Role, Vehicle } from '@/src/types/app';
import { formatRole, formatStatus } from '@/src/utils/format';

type Tone = 'positive' | 'warning' | 'danger' | 'info' | 'neutral';

function roleTone(role: Role): Tone {
  if (role === 'admin') return 'danger';
  if (role === 'supervisor') return 'info';
  return role === 'driver' ? 'positive' : 'neutral';
}

function statusTone(status: string): Tone {
  if (status === 'offline') return 'neutral';
  if (status === 'online') return 'info';
  return 'positive';
}

function getVehicleRoute(vehicle?: Vehicle) {
  if (!vehicle) return 'Sin ruta asignada';
  return vehicle.assignedRoute?.route?.label || vehicle.assignedRoute?.destinationLabel || vehicle.routeName || 'Sin ruta asignada';
}

export function UsersScreen() {
  const { width } = useWindowDimensions();
  const isPhone = width < 640;
  const { theme } = useAppTheme();
  const { loadUsers, mapData, refreshAll, user, users } = useAppStore(
    useShallow((state) => ({
      loadUsers: state.loadUsers,
      mapData: state.mapData,
      refreshAll: state.refreshAll,
      user: state.user,
      users: state.users,
    }))
  );
  const styles = useMemo(() => createStyles(theme, isPhone), [theme, isPhone]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const operationalUsers = useMemo(
    () => users.filter((entry) => entry.accountType !== 'company_owner'),
    [users]
  );
  const vehicles = useMemo(() => mapData?.vehicles || [], [mapData?.vehicles]);
  const vehicleById = useMemo(
    () => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])),
    [vehicles]
  );

  const refreshDirectory = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadUsers(), refreshAll()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadUsers, refreshAll]);

  useEffect(() => {
    if (user) {
      refreshDirectory().catch(() => undefined);
    }
  }, [refreshDirectory, user]);

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
      sectionKey="usuarios"
      mobileTitle="Directorio"
      mobileSubtitle="Personal y unidades en operación."
      onRefresh={refreshDirectory}
      refreshing={isRefreshing}
      header={
        <View style={styles.header}>
          <Text style={styles.eyebrow}>OPERACIÓN</Text>
          <Text style={styles.title}>Directorio operativo</Text>
          <Text style={styles.subtitle}>Consulta personal, estado, unidad y ruta asignada.</Text>
        </View>
      }>
      <AppCard style={styles.directoryCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>Personal operativo</Text>
            <Text style={styles.sectionSubtitle}>{operationalUsers.length} cuentas visibles</Text>
          </View>
        </View>

        <View style={styles.usersList}>
          {operationalUsers.length ? (
            operationalUsers.map((entry) => {
              const vehicle = entry.vehicleId ? vehicleById.get(entry.vehicleId) : undefined;

              return (
                <View key={entry.id} style={styles.userRow}>
                  <View style={styles.userTop}>
                    <UserAvatar user={entry} status={entry.status} showStatus size={56} />
                    <View style={styles.userMeta}>
                      <Text style={styles.userName} numberOfLines={2}>{entry.name}</Text>
                      <Text style={styles.userEmail} numberOfLines={1}>{entry.email}</Text>
                      <View style={styles.pillsRow}>
                        <StatusPill label={formatRole(entry.role)} tone={roleTone(entry.role)} />
                        <StatusPill label={formatStatus(entry.status)} tone={statusTone(entry.status)} />
                      </View>
                    </View>
                  </View>

                  <View style={styles.detailsGrid}>
                    <DetailItem label="Teléfono" value={entry.phone || 'Sin teléfono'} />
                    <DetailItem label="Turno" value={entry.shift || 'Sin turno'} />
                    <DetailItem label="Unidad" value={vehicle?.code || 'Sin unidad asignada'} />
                    <DetailItem label="Ruta" value={getVehicleRoute(vehicle)} />
                  </View>
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
    </AppShell>
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

function createStyles(theme: ReturnType<typeof useAppTheme>['theme'], isPhone = false) {
  return StyleSheet.create({
    header: {
      gap: 8,
      maxWidth: 760,
      paddingTop: isPhone ? AppTheme.spacing.sm : AppTheme.spacing.md,
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
    directoryCard: {
      width: '100%',
    },
    sectionHeader: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    sectionCopy: {
      flex: 1,
      gap: 6,
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
    userName: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: isPhone ? 17 : 19,
      fontWeight: '900',
    },
    userEmail: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: isPhone ? 13 : 14,
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
