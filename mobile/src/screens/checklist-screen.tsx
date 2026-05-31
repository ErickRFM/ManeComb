import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { Typography } from '@/constants/theme';
import { AppCard } from '@/src/components/app-card';
import { AppShell } from '@/src/components/app-shell';
import { StatusPill } from '@/src/components/status-pill';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type { FleetControlLog, Vehicle } from '@/src/types/app';
import { formatTime } from '@/src/utils/format';

function createStyles(theme: any, isCompact: boolean, isPhone: boolean) {
  return StyleSheet.create({
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    header: {
      gap: 16,
      paddingTop: 10,
    },
    titleRow: {
      flexDirection: isPhone ? 'column' : 'row',
      justifyContent: 'space-between',
      alignItems: isPhone ? 'flex-start' : 'center',
      gap: 14,
    },
    titleCopy: {
      flex: 1,
      minWidth: 0,
      gap: 6,
      maxWidth: 760,
    },
    eyebrow: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 2,
    },
    title: {
      fontSize: isPhone ? 28 : 34,
      fontWeight: '900',
      marginTop: 2,
      letterSpacing: -0.8,
      color: theme.colors.text,
      fontFamily: Typography.display,
    },
    subtitle: {
      color: theme.colors.muted,
      fontSize: 14,
      lineHeight: 22,
    },
    activeCounter: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: `${theme.colors.info}15`,
    },
    activeVal: {
      fontSize: 18,
      fontWeight: '900',
      fontFamily: Typography.mono,
      color: theme.colors.info,
    },
    activeLab: {
      fontSize: 9,
      fontWeight: '900',
      marginTop: 2,
      color: theme.colors.info,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    controlsCard: {
      gap: 16,
      width: '100%',
    },
    searchBar: {
      minHeight: 54,
      borderRadius: 16,
      borderWidth: 1.5,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      gap: 12,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.line,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.text,
    },
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
    },
    filterChipActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    filterChipText: {
      fontSize: 12,
      fontWeight: '800',
      color: theme.colors.muted,
    },
    filterChipTextActive: {
      color: theme.colors.accent,
    },
    contentGrid: {
      flexDirection: isCompact ? 'column' : 'row',
      gap: 18,
      alignItems: isCompact ? 'stretch' : 'flex-start',
      width: '100%',
    },
    panel: {
      gap: 16,
      width: '100%',
      minWidth: 0,
    },
    dispatchPanel: {
      flex: 0.9,
      minWidth: 0,
      maxWidth: isCompact ? undefined : 440,
    },
    historyPanel: {
      flex: 1.2,
      minWidth: 0,
      minHeight: 0,
    },
    panelTitle: {
      fontSize: 20,
      fontWeight: '900',
      color: theme.colors.text,
      fontFamily: Typography.display,
    },
    panelSubtitle: {
      color: theme.colors.muted,
      fontSize: 13,
      lineHeight: 20,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.2,
      marginBottom: 4,
      color: theme.colors.muted,
    },
    unitList: {
      gap: 12,
      paddingRight: 0,
    },
    unitBtn: {
      width: isPhone ? 124 : 112,
      minHeight: 138,
      borderRadius: 24,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      padding: 14,
    },
    unitIcon: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unitCode: {
      fontSize: 16,
      fontWeight: '900',
    },
    actionBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
    },
    actionBadgeText: {
      fontSize: 10,
      fontWeight: '900',
    },
    historyList: {
      gap: 14,
    },
    logCard: {
      padding: 16,
      gap: 16,
      borderRadius: 24,
    },
    logMain: {
      flexDirection: isPhone ? 'column' : 'row',
      justifyContent: 'space-between',
      alignItems: isPhone ? 'flex-start' : 'center',
      gap: 10,
    },
    logIdent: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
    logAvatar: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logTitle: {
      fontSize: 17,
      fontWeight: '900',
    },
    logDriver: {
      fontSize: 13,
      marginTop: 2,
    },
    timeline: {
      padding: 12,
      borderRadius: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    timeLabel: {
      fontSize: 9,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    timeVal: {
      fontSize: 14,
      fontWeight: '900',
      fontFamily: Typography.mono,
    },
    emptyState: {
      minHeight: 190,
      borderRadius: 24,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: theme.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      padding: 24,
    },
    emptyTitle: {
      color: theme.colors.text,
      fontSize: 17,
      fontWeight: '900',
      fontFamily: Typography.display,
    },
    emptyBody: {
      color: theme.colors.muted,
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
      maxWidth: 360,
    },
  });
}

export function ChecklistScreen() {
  const { theme } = useAppTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 1120;
  const isPhone = width < 600;
  const { mapData, user } = useAppStore(useShallow((state) => ({ mapData: state.mapData, user: state.user })));
  const [logs, setLogs] = useState<FleetControlLog[]>([
    {
      id: '1',
      vehicleId: 'v1',
      vehicleCode: 'CB-101',
      driverName: 'Juan Perez',
      departureAt: new Date(Date.now() - 3600000).toISOString(),
      status: 'active',
    },
    {
      id: '2',
      vehicleId: 'v2',
      vehicleCode: 'CB-204',
      driverName: 'Raul Diaz',
      departureAt: new Date(Date.now() - 7200000).toISOString(),
      arrivalAt: new Date(Date.now() - 3600000).toISOString(),
      status: 'completed',
    },
  ]);
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'completed'>('all');

  const styles = useMemo(() => createStyles(theme, isCompact, isPhone), [theme, isCompact, isPhone]);

  const activeVehicles = useMemo(() => {
    return (mapData?.vehicles || []).filter((vehicle) =>
      vehicle.code.toLowerCase().includes(search.toLowerCase())
    );
  }, [mapData, search]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch =
        log.vehicleCode.toLowerCase().includes(search.toLowerCase()) ||
        log.driverName?.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = filterMode === 'all' || log.status === filterMode;
      return matchesSearch && matchesFilter;
    });
  }, [filterMode, logs, search]);

  const handleToggleStatus = (vehicle: Vehicle) => {
    const activeLog = logs.find((log) => log.vehicleId === vehicle.id && log.status === 'active');

    if (activeLog) {
      setLogs((current) =>
        current.map((log) =>
          log.id === activeLog.id ? { ...log, status: 'completed', arrivalAt: new Date().toISOString() } : log
        )
      );
      return;
    }

    const newLog: FleetControlLog = {
      id: Math.random().toString(),
      vehicleId: vehicle.id,
      vehicleCode: vehicle.code,
      driverName: vehicle.driverName || 'Operador externo',
      departureAt: new Date().toISOString(),
      status: 'active',
    };

    setLogs((current) => [newLog, ...current]);
  };

  if (!user || !mapData) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
      </View>
    );
  }

  const activeCount = logs.filter((log) => log.status === 'active').length;

  return (
    <AppShell
      sectionKey="checklist"
      mobileTitle="Control"
      mobileSubtitle="Salidas, llegadas y seguimiento operativo de cada unidad."
      mobileBadges={[
        { label: `${activeCount} en ruta`, tone: 'info' },
        { label: `${filteredLogs.length} registros`, tone: 'neutral' },
      ]}
      header={
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.titleCopy}>
              <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>SISTEMA DE CONTROL</Text>
              <Text style={styles.title}>Checklist</Text>
              <Text style={styles.subtitle}>
                Organiza salidas, llegadas y filtros del historial con una estructura mas limpia.
              </Text>
            </View>
            <View style={styles.activeCounter}>
              <Text style={styles.activeVal}>{activeCount}</Text>
              <Text style={styles.activeLab}>En ruta</Text>
            </View>
          </View>
        </View>
      }>
      <AppCard style={styles.controlsCard}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={22} color={theme.colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Filtrar unidad o operador..."
            placeholderTextColor={theme.colors.muted}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.filterRow}>
          {[
            { id: 'all', label: 'Historial' },
            { id: 'active', label: 'En ruta' },
            { id: 'completed', label: 'Finalizados' },
          ].map((option) => {
            const isActive = filterMode === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => setFilterMode(option.id as typeof filterMode)}
                style={[styles.filterChip, isActive ? styles.filterChipActive : undefined]}>
                <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : undefined]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </AppCard>

      <View style={styles.contentGrid}>
        {filterMode !== 'completed' ? (
          <AppCard style={[styles.panel, styles.dispatchPanel]}>
            <Text style={styles.panelTitle}>Despacho rapido</Text>
            <Text style={styles.panelSubtitle}>Activa salida o llegada con un toque por unidad disponible.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unitList}>
              {activeVehicles.map((vehicle) => {
                const isActive = logs.some((log) => log.vehicleId === vehicle.id && log.status === 'active');

                return (
                  <Pressable
                    key={vehicle.id}
                    onPress={() => handleToggleStatus(vehicle)}
                    style={[
                      styles.unitBtn,
                      {
                        backgroundColor: isActive ? theme.colors.accent : theme.colors.surface,
                        borderColor: isActive ? theme.colors.accent : theme.colors.line,
                      },
                    ]}>
                    <View
                      style={[
                        styles.unitIcon,
                        {
                          backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : theme.colors.panel,
                        },
                      ]}>
                      <MaterialCommunityIcons name="bus" size={24} color={isActive ? '#FFF' : theme.colors.text} />
                    </View>
                    <Text style={[styles.unitCode, { color: isActive ? '#FFF' : theme.colors.text }]}>
                      {vehicle.code}
                    </Text>
                    <View
                      style={[
                        styles.actionBadge,
                        { backgroundColor: isActive ? '#FFF' : theme.colors.accent },
                      ]}>
                      <Text
                        style={[
                          styles.actionBadgeText,
                          { color: isActive ? theme.colors.accent : '#FFF' },
                        ]}>
                        {isActive ? 'Llegada' : 'Salida'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </AppCard>
        ) : null}

        <AppCard style={[styles.panel, styles.historyPanel]}>
          <Text style={styles.panelTitle}>Registros operativos</Text>
          <Text style={styles.panelSubtitle}>Consulta el historial reciente con tiempos y estado de cada unidad.</Text>

          <View style={styles.historyList}>
            {filteredLogs.length ? (
              filteredLogs.map((item) => (
                <AppCard key={item.id} style={styles.logCard}>
                  <View style={styles.logMain}>
                    <View style={styles.logIdent}>
                      <View
                        style={[
                          styles.logAvatar,
                          {
                            backgroundColor:
                              item.status === 'active'
                                ? `${theme.colors.info}15`
                                : `${theme.colors.success}15`,
                          },
                        ]}>
                        <MaterialCommunityIcons
                          name={item.status === 'active' ? 'clock-fast' : 'check-decagram'}
                          size={26}
                          color={item.status === 'active' ? theme.colors.info : theme.colors.success}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.logTitle, { color: theme.colors.text }]}>{item.vehicleCode}</Text>
                        <Text style={[styles.logDriver, { color: theme.colors.muted }]} numberOfLines={1}>
                          {item.driverName}
                        </Text>
                      </View>
                    </View>
                    <StatusPill
                      label={item.status === 'active' ? 'En ruta' : 'Listo'}
                      tone={item.status === 'active' ? 'info' : 'positive'}
                    />
                  </View>

                  <View style={[styles.timeline, { backgroundColor: theme.colors.panel }]}>
                    <View style={styles.timeRow}>
                      <MaterialCommunityIcons name="clock-outline" size={14} color={theme.colors.info} />
                      <Text style={[styles.timeLabel, { color: theme.colors.muted }]}>SAL</Text>
                      <Text style={[styles.timeVal, { color: theme.colors.text }]}>{formatTime(item.departureAt)}</Text>
                    </View>
                    {item.arrivalAt ? (
                      <View style={styles.timeRow}>
                        <MaterialCommunityIcons name="clock-check-outline" size={14} color={theme.colors.success} />
                        <Text style={[styles.timeLabel, { color: theme.colors.muted }]}>LLE</Text>
                        <Text style={[styles.timeVal, { color: theme.colors.text }]}>{formatTime(item.arrivalAt)}</Text>
                      </View>
                    ) : null}
                  </View>
                </AppCard>
              ))
            ) : (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="clipboard-check-outline" size={28} color={theme.colors.muted} />
                <Text style={styles.emptyTitle}>Sin registros filtrados</Text>
                <Text style={styles.emptyBody}>
                  Ajusta la busqueda o cambia el filtro para encontrar salidas y llegadas.
                </Text>
              </View>
            )}
          </View>
        </AppCard>
      </View>
    </AppShell>
  );
}
