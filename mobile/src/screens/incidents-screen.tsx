import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import * as Haptics from '@/src/native/haptics';
import { router, useLocalSearchParams } from '@/src/navigation/router';
import { useMemo, useRef, useState } from 'react';
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
import { DesignSystem, Typography } from '@/constants/theme';
import { AppCard } from '@/src/components/app-card';
import { AppShell } from '@/src/components/app-shell';
import { PrimaryButton } from '@/src/components/primary-button';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type { Incident, IncidentDraft, IncidentSeverity, LiveLocationsData, User } from '@/src/types/app';
import { formatRelativeTime } from '@/src/utils/format';
import { getTextInputProps } from '@/src/utils/text-input-props';

const INCIDENT_TYPES = ['traffic', 'maintenance', 'security', 'passengers'] as const;
const SEVERITIES: IncidentSeverity[] = ['medium', 'high', 'critical'];
const INITIAL_VISIBLE_EVENTS = 8;

type IncidentTypeKey =
  | 'traffic'
  | 'unit'
  | 'security'
  | 'sos'
  | 'passengers'
  | 'maintenance'
  | 'general';
type IncidentStatusKey = 'open' | 'in_progress' | 'resolved' | 'canceled' | 'unknown';
type IncidentFilterKey = 'all' | 'critical' | 'sos' | 'unit' | 'traffic' | 'security' | 'today';
type IncidentIcon = keyof typeof MaterialCommunityIcons.glyphMap;
type IncidentVisualStyle = {
  backgroundColor: string;
  color: string;
  icon: IncidentIcon;
  label: string;
};
type SeverityVisualStyle = {
  backgroundColor: string;
  color: string;
  label: string;
};

const INCIDENT_TYPE_STYLES: Record<IncidentTypeKey, IncidentVisualStyle> = {
  traffic: {
    backgroundColor: 'rgba(79, 141, 255, 0.15)',
    color: '#5F98FF',
    icon: 'routes',
    label: 'Trafico',
  },
  unit: {
    backgroundColor: 'rgba(230, 161, 31, 0.16)',
    color: '#E6A11F',
    icon: 'bus-alert',
    label: 'Unidad',
  },
  security: {
    backgroundColor: 'rgba(165, 107, 255, 0.15)',
    color: '#A56BFF',
    icon: 'shield-alert-outline',
    label: 'Seguridad',
  },
  sos: {
    backgroundColor: 'rgba(240, 106, 106, 0.16)',
    color: '#F06A6A',
    icon: 'alert-octagon-outline',
    label: 'SOS',
  },
  passengers: {
    backgroundColor: 'rgba(217, 111, 167, 0.15)',
    color: '#D96FA7',
    icon: 'account-alert-outline',
    label: 'Pasajeros',
  },
  maintenance: {
    backgroundColor: 'rgba(53, 200, 107, 0.15)',
    color: '#35C86B',
    icon: 'wrench-check-outline',
    label: 'Mantenimiento',
  },
  general: {
    backgroundColor: 'rgba(159, 176, 202, 0.14)',
    color: '#A8B1C2',
    icon: 'alert-circle-outline',
    label: 'General',
  },
};

const SEVERITY_STYLES: Record<IncidentSeverity, SeverityVisualStyle> = {
  low: {
    backgroundColor: 'rgba(159, 176, 202, 0.14)',
    color: '#A8B1C2',
    label: 'Baja',
  },
  medium: {
    backgroundColor: 'rgba(230, 161, 31, 0.14)',
    color: '#E6A11F',
    label: 'Media',
  },
  high: {
    backgroundColor: 'rgba(242, 140, 40, 0.16)',
    color: '#F28C28',
    label: 'Alta',
  },
  critical: {
    backgroundColor: 'rgba(240, 106, 106, 0.16)',
    color: '#F06A6A',
    label: 'Critica',
  },
};

const STATUS_STYLES: Record<IncidentStatusKey, SeverityVisualStyle> = {
  open: {
    backgroundColor: 'rgba(230, 161, 31, 0.14)',
    color: '#E6A11F',
    label: 'Abierta',
  },
  in_progress: {
    backgroundColor: 'rgba(79, 141, 255, 0.15)',
    color: '#5F98FF',
    label: 'Atendiendo',
  },
  resolved: {
    backgroundColor: 'rgba(53, 200, 107, 0.15)',
    color: '#35C86B',
    label: 'Cerrada',
  },
  canceled: {
    backgroundColor: 'rgba(159, 176, 202, 0.14)',
    color: '#A8B1C2',
    label: 'Cancelada',
  },
  unknown: {
    backgroundColor: 'rgba(159, 176, 202, 0.14)',
    color: '#A8B1C2',
    label: 'Estado desconocido',
  },
};

const FILTERS: {
  icon: IncidentIcon;
  key: IncidentFilterKey;
  label: string;
}[] = [
  { key: 'all', label: 'Todas', icon: 'format-list-bulleted' },
  { key: 'critical', label: 'Criticas', icon: 'alert-decagram-outline' },
  { key: 'sos', label: 'SOS', icon: 'alert-octagon-outline' },
  { key: 'unit', label: 'Unidad', icon: 'bus-alert' },
  { key: 'traffic', label: 'Trafico', icon: 'routes' },
  { key: 'security', label: 'Seguridad', icon: 'shield-alert-outline' },
  { key: 'today', label: 'Hoy', icon: 'calendar-today' },
];

function normalizeSearchValue(value?: string | null) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getIncidentTypeKey(incident: Incident): IncidentTypeKey {
  const type = normalizeSearchValue(incident.type);
  const title = normalizeSearchValue(incident.title);

  if (type === 'sos' || title.startsWith('sos')) return 'sos';
  if (['traffic', 'trafico', 'route', 'ruta'].includes(type)) return 'traffic';
  if (['unit', 'unidad', 'vehicle', 'vehiculo', 'combi', 'bus'].includes(type)) return 'unit';
  if (['security', 'seguridad'].includes(type)) return 'security';
  if (['passengers', 'pasajeros', 'passenger'].includes(type)) return 'passengers';
  if (['maintenance', 'mantenimiento', 'service'].includes(type)) return 'maintenance';

  return 'general';
}

function getIncidentStatusKey(status?: string | null): IncidentStatusKey {
  const normalized = normalizeSearchValue(status).replaceAll(' ', '_');

  if (['open', 'abierta', 'abierto'].includes(normalized)) return 'open';
  if (['in_progress', 'atendiendo', 'en_proceso', 'active', 'activa'].includes(normalized)) {
    return 'in_progress';
  }
  if (['resolved', 'closed', 'cerrada', 'cerrado', 'resuelta', 'resuelto'].includes(normalized)) {
    return 'resolved';
  }
  if (['canceled', 'cancelled', 'cancelada', 'cancelado'].includes(normalized)) return 'canceled';

  return 'unknown';
}

function getSeverityStyle(severity?: string | null) {
  const normalized = normalizeSearchValue(severity) as IncidentSeverity;
  return SEVERITY_STYLES[normalized] || SEVERITY_STYLES.medium;
}

function getIncidentUnitLabel(incident: Incident) {
  return incident.vehicle?.code || 'Sin unidad';
}

function hasIncidentLocation(incident: Incident) {
  return Boolean(
    Number.isFinite(Number(incident.location?.latitude)) &&
      Number.isFinite(Number(incident.location?.longitude))
  );
}

function getIncidentContext(user: User | null, mapData: LiveLocationsData | null): Pick<IncidentDraft, 'location' | 'routeId' | 'vehicleId'> {
  const vehicle = user?.vehicleId
    ? mapData?.vehicles.find((entry) => entry.id === user.vehicleId) || null
    : null;
  const vehicleLocation = vehicle?.locationTimestamp ? vehicle.location : null;

  return {
    vehicleId: vehicle?.id || user?.vehicleId || null,
    routeId: vehicle?.routeId || vehicle?.route?.id || null,
    location: vehicleLocation
      ? {
          latitude: vehicleLocation.latitude,
          longitude: vehicleLocation.longitude,
          timestamp: vehicle?.locationTimestamp || null,
        }
      : null,
  };
}

function isIncidentActive(incident: Incident) {
  const status = getIncidentStatusKey(incident.status);
  return status !== 'resolved' && status !== 'canceled';
}

function isToday(value: string) {
  const incidentDate = new Date(value);
  const currentDate = new Date();

  return (
    incidentDate.getFullYear() === currentDate.getFullYear() &&
    incidentDate.getMonth() === currentDate.getMonth() &&
    incidentDate.getDate() === currentDate.getDate()
  );
}

function matchesFilter(incident: Incident, filter: IncidentFilterKey) {
  const typeKey = getIncidentTypeKey(incident);

  if (filter === 'all') return true;
  if (filter === 'critical') return getSeverityStyle(incident.severity) === SEVERITY_STYLES.critical;
  if (filter === 'sos') return typeKey === 'sos';
  if (filter === 'unit') return typeKey === 'unit' || typeKey === 'maintenance';
  if (filter === 'today') return isToday(incident.createdAt);

  return typeKey === filter;
}

function matchesSearch(incident: Incident, search: string) {
  if (!search) return true;

  return normalizeSearchValue(
    [
      incident.title,
      incident.description,
      incident.type,
      incident.status,
      incident.severity,
      incident.vehicle?.code,
      incident.vehicleId,
      incident.route?.name,
      incident.route?.code,
    ].join(' ')
  ).includes(search);
}

function VisualBadge({
  icon,
  label,
  visualStyle,
}: {
  icon?: IncidentIcon;
  label: string;
  visualStyle: SeverityVisualStyle;
}) {
  return (
    <View style={[badgeStyles.badge, { backgroundColor: visualStyle.backgroundColor }]}>
      {icon ? <MaterialCommunityIcons name={icon} size={13} color={visualStyle.color} /> : null}
      <Text style={[badgeStyles.label, { color: visualStyle.color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  label: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '900',
  },
});

function createStyles(theme: any, isCompact: boolean, isPhone: boolean) {
  return StyleSheet.create({
    header: {
      gap: 12,
      paddingTop: 8,
    },
    titleRow: {
      flexDirection: isPhone ? 'column' : 'row',
      justifyContent: 'space-between',
      alignItems: isPhone ? 'flex-start' : 'center',
      gap: 12,
    },
    titleCopy: {
      flex: 1,
      minWidth: 0,
      gap: 5,
      maxWidth: 760,
    },
    eyebrow: {
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 2,
    },
    title: {
      fontSize: isPhone ? 24 : 30,
      fontWeight: '900',
      color: theme.colors.text,
      fontFamily: Typography.display,
    },
    subtitle: {
      color: theme.colors.muted,
      fontSize: 14,
      lineHeight: 20,
    },
    summaryHUD: {
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.line,
      gap: 2,
    },
    summaryHUDLabel: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: theme.colors.muted,
    },
    summaryHUDText: {
      fontSize: 16,
      fontWeight: '900',
      color: theme.colors.danger,
    },
    sosGrid: {
      flexDirection: 'row',
      gap: 10,
    },
    sosBtn: {
      flex: 1,
      minHeight: isPhone ? 46 : 50,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      elevation: 4,
    },
    sosBtnDisabled: {
      opacity: 0.62,
    },
    sosBtnText: {
      color: '#FFF',
      fontWeight: '900',
      fontSize: 14,
    },
    contentLayout: {
      flexDirection: isCompact ? 'column' : 'row',
      gap: 14,
      alignItems: 'stretch',
      width: '100%',
      minWidth: 0,
    },
    formCard: {
      flexGrow: 0,
      flexShrink: 0,
      width: isCompact ? '100%' : '34%',
      minWidth: 0,
      maxWidth: isCompact ? undefined : 420,
      backgroundColor: theme.colors.surface,
      padding: isPhone ? 14 : 16,
      gap: 12,
      borderRadius: 16,
    },
    panelHeader: {
      gap: 4,
    },
    panelTitle: {
      fontSize: 18,
      fontWeight: '900',
      color: theme.colors.text,
      fontFamily: Typography.display,
    },
    panelSubtitle: {
      color: theme.colors.muted,
      fontSize: 13,
      lineHeight: 18,
    },
    fieldGroup: {
      gap: 8,
    },
    fieldLabel: {
      color: theme.colors.muted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    input: {
      minHeight: DesignSystem.control.md,
      backgroundColor: theme.colors.input,
      borderRadius: DesignSystem.radius.input,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.colors.text,
      fontSize: 14,
      borderWidth: 1,
      borderColor: theme.colors.line,
    },
    textArea: {
      height: 88,
      textAlignVertical: 'top',
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 11,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.line,
    },
    chipText: {
      fontSize: 11,
      fontWeight: '800',
      color: theme.colors.muted,
    },
    timelinePanel: {
      flex: 1,
      width: '100%',
      gap: 10,
      minWidth: 0,
      minHeight: 0,
      padding: isPhone ? 12 : 14,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
    },
    timelineHeaderRow: {
      flexDirection: isPhone ? 'column' : 'row',
      alignItems: isPhone ? 'flex-start' : 'center',
      justifyContent: 'space-between',
      gap: 10,
      minWidth: 0,
    },
    timelineHeaderCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    resultCount: {
      color: theme.colors.muted,
      fontSize: 11,
      fontWeight: '800',
    },
    filtersScroll: {
      marginHorizontal: -2,
      flexGrow: 0,
    },
    filtersContent: {
      gap: 7,
      paddingHorizontal: 2,
      paddingVertical: 2,
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      minHeight: 31,
      paddingHorizontal: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
    },
    filterChipActive: {
      backgroundColor: theme.colors.infoSoft,
      borderColor: theme.colors.info,
    },
    filterChipText: {
      color: theme.colors.muted,
      fontSize: 11,
      fontWeight: '800',
    },
    filterChipTextActive: {
      color: theme.colors.info,
    },
    searchShell: {
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 11,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.input,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 8,
      color: theme.colors.text,
      fontSize: 13,
    },
    clearSearchButton: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 11,
      paddingVertical: 9,
      borderRadius: 10,
      borderWidth: 1,
    },
    errorText: {
      flex: 1,
      minWidth: 0,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 17,
    },
    timelineScroll: {
      maxHeight: isPhone ? 580 : isCompact ? 660 : 720,
      minHeight: orderedPanelMinHeight(isPhone),
    },
    timelineContainer: {
      gap: 8,
      paddingTop: 2,
      paddingBottom: 4,
    },
    timelineItem: {
      flexDirection: 'row',
      gap: 8,
      minWidth: 0,
    },
    timelineLine: {
      alignItems: 'center',
      alignSelf: 'stretch',
      width: 16,
      position: 'relative',
    },
    timelineDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      zIndex: 2,
      marginTop: 17,
      borderWidth: 2,
      borderColor: theme.colors.surface,
    },
    timelineConnector: {
      position: 'absolute',
      top: 28,
      bottom: -10,
      width: 1,
      backgroundColor: theme.colors.line,
    },
    incidentCard: {
      flex: 1,
      minWidth: 0,
      backgroundColor: theme.colors.cardSoft,
      borderRadius: 12,
      borderWidth: 1,
      borderLeftWidth: 3,
      borderColor: theme.colors.line,
      paddingHorizontal: 11,
      paddingVertical: 10,
      gap: 7,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      minWidth: 0,
    },
    typeIconShell: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    incidentHeading: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    incidentTitle: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '900',
    },
    incidentTime: {
      color: theme.colors.muted,
      fontSize: 11,
      fontWeight: '700',
    },
    incidentDesc: {
      color: theme.colors.muted,
      fontSize: 12,
      lineHeight: 17,
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
    },
    incidentMeta: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    incidentMetaText: {
      flex: 1,
      minWidth: 0,
      color: theme.colors.muted,
      fontSize: 11,
      fontWeight: '700',
    },
    resolveButton: {
      minHeight: 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      borderRadius: 9,
      backgroundColor: theme.colors.successSoft,
    },
    resolveLink: {
      color: theme.colors.success,
      fontSize: 11,
      fontWeight: '900',
    },
    mapButton: {
      minHeight: 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      borderRadius: 9,
      backgroundColor: theme.colors.infoSoft,
    },
    mapLink: {
      color: theme.colors.info,
      fontSize: 11,
      fontWeight: '900',
    },
    loadMoreButton: {
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 12,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
    },
    loadMoreText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: '800',
    },
    stateBox: {
      minHeight: 160,
      borderRadius: 14,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 18,
    },
    stateTitle: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '900',
      fontFamily: Typography.display,
      textAlign: 'center',
    },
    stateBody: {
      color: theme.colors.muted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
      maxWidth: 420,
    },
  });
}

function orderedPanelMinHeight(isPhone: boolean) {
  return isPhone ? 180 : 220;
}

export function IncidentsScreen() {
  const { theme } = useAppTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 1040;
  const isPhone = width < 600;

  const {
    createIncident,
    error,
    focusedIncidentId,
    incidents,
    isRefreshing,
    isSubmitting,
    mapData,
    refreshAll,
    updateIncidentStatus,
    user,
  } = useAppStore(
    useShallow((state) => ({
      createIncident: state.createIncident,
      error: state.error,
      focusedIncidentId: state.focusedIncidentId,
      incidents: state.incidents,
      isRefreshing: state.isRefreshing,
      isSubmitting: state.isSubmitting,
      mapData: state.mapData,
      refreshAll: state.refreshAll,
      updateIncidentStatus: state.updateIncidentStatus,
      user: state.user,
    }))
  );

  const params = useLocalSearchParams<{ incidentId?: string }>();
  const screenStyles = useMemo(
    () => createStyles(theme, isCompact, isPhone),
    [theme, isCompact, isPhone]
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<(typeof INCIDENT_TYPES)[number]>('traffic');
  const [severity, setSeverity] = useState<IncidentSeverity>('medium');
  const [activeFilter, setActiveFilter] = useState<IncidentFilterKey>('all');
  const [search, setSearch] = useState('');
  const [showAllEvents, setShowAllEvents] = useState(false);
  const descriptionInputRef = useRef<TextInput>(null);

  const summary = useMemo(() => {
    const activeIncidents = incidents.filter(isIncidentActive);

    return {
      critical: activeIncidents.filter((incident) => getSeverityStyle(incident.severity) === SEVERITY_STYLES.critical).length,
      open: activeIncidents.length,
    };
  }, [incidents]);

  const orderedIncidents = useMemo(() => {
    const focusId = params.incidentId || focusedIncidentId;

    return [...incidents].sort((left, right) => {
      if (left.id === focusId) return -1;
      if (right.id === focusId) return 1;
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }, [focusedIncidentId, incidents, params.incidentId]);

  const normalizedSearch = normalizeSearchValue(search);
  const filteredIncidents = useMemo(
    () =>
      orderedIncidents.filter(
        (incident) => matchesFilter(incident, activeFilter) && matchesSearch(incident, normalizedSearch)
      ),
    [activeFilter, normalizedSearch, orderedIncidents]
  );
  const visibleIncidents = showAllEvents
    ? filteredIncidents
    : filteredIncidents.slice(0, INITIAL_VISIBLE_EVENTS);
  const hiddenEventsCount = Math.max(filteredIncidents.length - visibleIncidents.length, 0);

  const handleCreate = async () => {
    if (!title.trim() || !description.trim()) return;

    const ok = await createIncident({ title, type, description, severity, ...getIncidentContext(user, mapData) });
    if (ok) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setTitle('');
      setDescription('');
      setType('traffic');
      setSeverity('medium');
    }
  };

  const handleQuickSos = async (sosType: 'security' | 'maintenance') => {
    const isPanic = sosType === 'security';

    const created = await createIncident({
      title: isPanic ? 'SOS PANICO' : 'Alerta critica de unidad',
      type: sosType,
      description: isPanic
        ? `Alerta critica de seguridad enviada por ${user?.name || 'operador'}.`
        : `Alerta critica de unidad enviada por ${user?.name || 'operador'}.`,
      severity: 'critical',
      ...getIncidentContext(user, mapData),
    });
    if (created) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  };

  return (
    <AppShell
      onRefresh={refreshAll}
      refreshing={isRefreshing}
      sectionKey="incidencias"
      mobileTitle="Incidencias"
      mobileSubtitle="Reportes y seguimiento"
      mobileBadges={[
        { label: `${summary.open} activas`, tone: summary.open ? 'warning' : 'positive' },
        { label: `${summary.critical} criticas`, tone: summary.critical ? 'danger' : 'neutral' },
      ]}
      header={
        <View style={screenStyles.header}>
          <View style={screenStyles.titleRow}>
            <View style={screenStyles.titleCopy}>
              <Text style={screenStyles.title}>Incidencias</Text>
            </View>
            <View style={screenStyles.summaryHUD}>
              <Text style={screenStyles.summaryHUDLabel}>Abiertas / activas</Text>
              <Text style={screenStyles.summaryHUDText}>{summary.open}</Text>
            </View>
          </View>

          <View style={screenStyles.sosGrid}>
            <Pressable
              accessibilityLabel="Emitir alerta de panico"
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={() => { handleQuickSos('security'); }}
              style={[
                screenStyles.sosBtn,
                { backgroundColor: theme.colors.danger },
                isSubmitting ? screenStyles.sosBtnDisabled : undefined,
              ]}>
              <MaterialCommunityIcons name="shield-alert" size={21} color="#FFF" />
              <Text style={screenStyles.sosBtnText}>Panico</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Emitir alerta critica de unidad"
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={() => { handleQuickSos('maintenance'); }}
              style={[
                screenStyles.sosBtn,
                { backgroundColor: theme.colors.warning },
                isSubmitting ? screenStyles.sosBtnDisabled : undefined,
              ]}>
              <MaterialCommunityIcons name="bus-alert" size={21} color="#FFF" />
              <Text style={screenStyles.sosBtnText}>Unidad</Text>
            </Pressable>
          </View>
        </View>
      }>
      <View style={screenStyles.contentLayout}>
        <AppCard style={screenStyles.formCard}>
          <View style={screenStyles.panelHeader}>
            <Text style={screenStyles.panelTitle}>Nuevo reporte</Text>

          </View>

          <View style={screenStyles.fieldGroup}>
            <Text style={screenStyles.fieldLabel}>Titulo</Text>
            <TextInput
              {...getTextInputProps(theme, { autoComplete: 'off', returnKeyType: 'next' })}
              maxLength={100}
              placeholder="Titulo de la incidencia"
              placeholderTextColor={theme.colors.muted}
              style={screenStyles.input}
              value={title}
              onChangeText={setTitle}
              onSubmitEditing={() => descriptionInputRef.current?.focus()}
            />
          </View>

          <View style={screenStyles.fieldGroup}>
            <Text style={screenStyles.fieldLabel}>Tipo</Text>
            <View style={screenStyles.chipRow}>
              {INCIDENT_TYPES.map((incidentType) => {
                const isActive = type === incidentType;
                const typeStyle = INCIDENT_TYPE_STYLES[incidentType];

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={incidentType}
                    onPress={() => setType(incidentType)}
                    style={[
                      screenStyles.chip,
                      isActive
                        ? {
                            backgroundColor: typeStyle.backgroundColor,
                            borderColor: typeStyle.color,
                          }
                        : undefined,
                    ]}>
                    <MaterialCommunityIcons
                      name={typeStyle.icon}
                      size={14}
                      color={isActive ? typeStyle.color : theme.colors.muted}
                    />
                    <Text style={[screenStyles.chipText, isActive ? { color: typeStyle.color } : undefined]}>
                      {typeStyle.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={screenStyles.fieldGroup}>
            <Text style={screenStyles.fieldLabel}>Severidad</Text>
            <View style={screenStyles.chipRow}>
              {SEVERITIES.map((incidentSeverity) => {
                const isActive = severity === incidentSeverity;
                const severityStyle = SEVERITY_STYLES[incidentSeverity];

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={incidentSeverity}
                    onPress={() => setSeverity(incidentSeverity)}
                    style={[
                      screenStyles.chip,
                      isActive
                        ? {
                            backgroundColor: severityStyle.backgroundColor,
                            borderColor: severityStyle.color,
                          }
                        : undefined,
                    ]}>
                    <MaterialCommunityIcons
                      name="circle-medium"
                      size={14}
                      color={isActive ? severityStyle.color : theme.colors.muted}
                    />
                    <Text style={[screenStyles.chipText, isActive ? { color: severityStyle.color } : undefined]}>
                      {severityStyle.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={screenStyles.fieldGroup}>
            <Text style={screenStyles.fieldLabel}>Descripcion</Text>
            <TextInput
              ref={descriptionInputRef}
              {...getTextInputProps(theme, {
                autoComplete: 'off',
                returnKeyType: 'done',
                submitBehavior: 'blurAndSubmit',
              })}
              maxLength={420}
              multiline
              numberOfLines={4}
              placeholder="Detalles del evento..."
              placeholderTextColor={theme.colors.muted}
              style={[screenStyles.input, screenStyles.textArea]}
              value={description}
              onChangeText={setDescription}
              onSubmitEditing={() => { handleCreate(); }}
            />
          </View>

          <PrimaryButton
            icon="alert-circle-outline"
            label="Emitir alerta"
            loading={isSubmitting}
            onPress={handleCreate}
          />
        </AppCard>

        <AppCard style={screenStyles.timelinePanel}>
          <View style={screenStyles.timelineHeaderRow}>
            <View style={screenStyles.timelineHeaderCopy}>
              <Text style={screenStyles.panelTitle}>Bitacora de eventos</Text>

            </View>
            <Text style={screenStyles.resultCount}>
              {filteredIncidents.length} {filteredIncidents.length === 1 ? 'evento' : 'eventos'}
            </Text>
          </View>

          <ScrollView
            horizontal
            contentContainerStyle={screenStyles.filtersContent}
            showsHorizontalScrollIndicator={false}
            style={screenStyles.filtersScroll}>
            {FILTERS.map((filter) => {
              const isActive = filter.key === activeFilter;

              return (
                <Pressable
                  accessibilityRole="button"
                  key={filter.key}
                  onPress={() => {
                    setActiveFilter(filter.key);
                    setShowAllEvents(false);
                  }}
                  style={[screenStyles.filterChip, isActive ? screenStyles.filterChipActive : undefined]}>
                  <MaterialCommunityIcons
                    name={filter.icon}
                    size={14}
                    color={isActive ? theme.colors.info : theme.colors.muted}
                  />
                  <Text
                    style={[
                      screenStyles.filterChipText,
                      isActive ? screenStyles.filterChipTextActive : undefined,
                    ]}>
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={screenStyles.searchShell}>
            <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.muted} />
            <TextInput
              {...getTextInputProps(theme, { autoComplete: 'off', returnKeyType: 'search' })}
              placeholder="Buscar evento..."
              placeholderTextColor={theme.colors.muted}
              style={screenStyles.searchInput}
              value={search}
              onChangeText={(value) => {
                setSearch(value);
                setShowAllEvents(false);
              }}
            />
            {search ? (
              <Pressable
                accessibilityLabel="Limpiar busqueda"
                accessibilityRole="button"
                onPress={() => setSearch('')}
                style={screenStyles.clearSearchButton}>
                <MaterialCommunityIcons name="close-circle" size={18} color={theme.colors.muted} />
              </Pressable>
            ) : null}
          </View>

          {error ? (
            <View
              style={[
                screenStyles.errorBanner,
                {
                  backgroundColor: theme.colors.warningSoft,
                  borderColor: theme.colors.warning,
                },
              ]}>
              <MaterialCommunityIcons name="alert-circle-outline" size={17} color={theme.colors.warning} />
              <Text style={[screenStyles.errorText, { color: theme.colors.warning }]} numberOfLines={2}>
                {error}
              </Text>
            </View>
          ) : null}

          {isRefreshing && !incidents.length ? (
            <View style={screenStyles.stateBox}>
              <ActivityIndicator color={theme.colors.accent} />
              <Text style={screenStyles.stateTitle}>Cargando</Text>
            </View>
          ) : visibleIncidents.length ? (
            <>
              <ScrollView
                contentContainerStyle={screenStyles.timelineContainer}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                style={screenStyles.timelineScroll}>
                {visibleIncidents.map((incident, index) => {
                  const typeStyle = INCIDENT_TYPE_STYLES[getIncidentTypeKey(incident)];
                  const severityStyle = getSeverityStyle(incident.severity);
                  const statusStyle = STATUS_STYLES[getIncidentStatusKey(incident.status)];
                  const canResolve = (user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'owner') && isIncidentActive(incident);

                  return (
                    <View key={incident.id} style={screenStyles.timelineItem}>
                      <View style={screenStyles.timelineLine}>
                        <View style={[screenStyles.timelineDot, { backgroundColor: severityStyle.color }]} />
                        {index < visibleIncidents.length - 1 ? (
                          <View style={screenStyles.timelineConnector} />
                        ) : null}
                      </View>

                      <View style={[screenStyles.incidentCard, { borderLeftColor: severityStyle.color }]}>
                        <View style={screenStyles.cardHeader}>
                          <View style={[screenStyles.typeIconShell, { backgroundColor: typeStyle.backgroundColor }]}>
                            <MaterialCommunityIcons name={typeStyle.icon} size={17} color={typeStyle.color} />
                          </View>
                          <View style={screenStyles.incidentHeading}>
                            <Text style={screenStyles.incidentTitle} numberOfLines={1}>
                              {incident.title || 'Incidencia sin titulo'}
                            </Text>
                            <Text style={screenStyles.incidentTime}>{formatRelativeTime(incident.createdAt)}</Text>
                          </View>
                          <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.muted} />
                        </View>

                        <Text style={screenStyles.incidentDesc} numberOfLines={2}>
                          {incident.description || 'Sin descripcion disponible.'}
                        </Text>

                        <View style={screenStyles.metaRow}>
                          <VisualBadge icon={typeStyle.icon} label={typeStyle.label} visualStyle={typeStyle} />
                          <VisualBadge label={statusStyle.label} visualStyle={statusStyle} />
                          <VisualBadge label={severityStyle.label} visualStyle={severityStyle} />
                        </View>

                        <View style={screenStyles.cardFooter}>
                          <View style={screenStyles.incidentMeta}>
                            <MaterialCommunityIcons
                              name={hasIncidentLocation(incident) ? 'map-marker-check-outline' : 'map-marker-off-outline'}
                              size={14}
                              color={theme.colors.muted}
                            />
                            <Text style={screenStyles.incidentMetaText} numberOfLines={1}>
                              {hasIncidentLocation(incident)
                                ? `${getIncidentUnitLabel(incident)} · Con ubicacion`
                                : `${getIncidentUnitLabel(incident)} · Sin ubicacion GPS`}
                            </Text>
                          </View>
                          {hasIncidentLocation(incident) ? (
                            <Pressable
                              accessibilityLabel={`Abrir ubicacion de ${incident.title}`}
                              accessibilityRole="button"
                              onPress={() => router.push({
                                pathname: '/mapa',
                                params: {
                                  focusLatitude: String(incident.location?.latitude),
                                  focusLongitude: String(incident.location?.longitude),
                                },
                              })}
                              style={screenStyles.mapButton}>
                              <MaterialCommunityIcons
                                name="map-marker-radius-outline"
                                size={14}
                                color={theme.colors.info}
                              />
                              <Text style={screenStyles.mapLink}>Mapa</Text>
                            </Pressable>
                          ) : null}
                          {canResolve ? (
                            <Pressable
                              accessibilityLabel={`Marcar resuelta ${incident.title}`}
                              accessibilityRole="button"
                              onPress={() => { updateIncidentStatus(incident.id, 'resolved'); }}
                              style={screenStyles.resolveButton}>
                              <MaterialCommunityIcons
                                name="check-circle-outline"
                                size={14}
                                color={theme.colors.success}
                              />
                              <Text style={screenStyles.resolveLink}>Resolver</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              {hiddenEventsCount || (showAllEvents && filteredIncidents.length > INITIAL_VISIBLE_EVENTS) ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowAllEvents((current) => !current)}
                  style={screenStyles.loadMoreButton}>
                  <MaterialCommunityIcons
                    name={showAllEvents ? 'chevron-up' : 'chevron-down'}
                    size={17}
                    color={theme.colors.text}
                  />
                  <Text style={screenStyles.loadMoreText}>
                    {showAllEvents ? 'Mostrar menos' : `Ver mas eventos (${hiddenEventsCount})`}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <View style={screenStyles.stateBox}>
              <MaterialCommunityIcons
                name={incidents.length ? 'magnify-close' : 'clipboard-text-clock-outline'}
                size={27}
                color={theme.colors.muted}
              />
              <Text style={screenStyles.stateTitle}>
                {incidents.length ? 'Sin coincidencias' : 'Sin eventos recientes'}
              </Text>
              <Text style={screenStyles.stateBody}>
                {incidents.length
                  ? 'Ajusta los filtros o la busqueda.'
                  : 'Sin eventos recientes'}
              </Text>
            </View>
          )}
        </AppCard>
      </View>
    </AppShell>
  );
}
