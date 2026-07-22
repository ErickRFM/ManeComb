import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import * as Haptics from '@/src/native/haptics';
import { router, useLocalSearchParams } from '@/src/navigation/router';
import { useMemo, useRef, useState } from 'react';
import {
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
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type { IncidentSeverity } from '@/src/types/app';
import { formatRelativeTime } from '@/src/utils/format';
import {
  INCIDENT_TYPES,
  INCIDENT_TYPE_STYLES,
  INITIAL_VISIBLE_EVENTS,
  SEVERITIES,
  SEVERITY_STYLES,
  STATUS_STYLES,
  type IncidentFilterKey,
} from './constants/alerts.constants';
import {
  getIncidentContext,
  getIncidentStatusKey,
  getIncidentTypeKey,
  getIncidentUnitLabel,
  getSeverityStyle,
  hasIncidentLocation,
  isIncidentActive,
  matchesFilter,
  matchesSearch,
  normalizeSearchValue,
} from './utils/alerts.utils';
import { AlertBadge } from './components/AlertBadge';
import { AlertsHeader } from './components/AlertsHeader';
import { AlertFilters } from './components/AlertFilters';
import { AlertSearch } from './components/AlertSearch';
import { AlertForm } from './components/AlertForm';
import { AlertState } from './components/AlertState';

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

export function AlertsScreen() {
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
    operationalUnits,
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
      operationalUnits: state.operationalUnits,
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

    const ok = await createIncident({ title, type, description, severity, ...getIncidentContext(user, operationalUnits) });
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
      ...getIncidentContext(user, operationalUnits),
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
      mobileTitle="Alertas"
      mobileSubtitle="Reportes y seguimiento"
      mobileBadges={[
        { label: `${summary.open} activas`, tone: summary.open ? 'warning' : 'positive' },
        { label: `${summary.critical} criticas`, tone: summary.critical ? 'danger' : 'neutral' },
      ]}
      header={
        <AlertsHeader
          isSubmitting={isSubmitting}
          onPanic={() => { handleQuickSos('security'); }}
          onUnit={() => { handleQuickSos('maintenance'); }}
          open={summary.open}
          styles={screenStyles}
          theme={theme}
        />
      }>
      <View style={screenStyles.contentLayout}>
        <AlertForm
          description={description}
          descriptionInputRef={descriptionInputRef}
          isSubmitting={isSubmitting}
          onCreate={handleCreate}
          onDescriptionChange={setDescription}
          onSeverityChange={setSeverity}
          onTitleChange={setTitle}
          onTypeChange={setType}
          severity={severity}
          styles={screenStyles}
          theme={theme}
          title={title}
          type={type}
        />

        <AppCard style={screenStyles.timelinePanel}>
          <View style={screenStyles.timelineHeaderRow}>
            <View style={screenStyles.timelineHeaderCopy}>
              <Text style={screenStyles.panelTitle}>Historial de alertas</Text>

            </View>
            <Text style={screenStyles.resultCount}>
              {filteredIncidents.length} {filteredIncidents.length === 1 ? 'alerta' : 'alertas'}
            </Text>
          </View>

          <AlertFilters
            activeFilter={activeFilter}
            onChange={(filter) => {
              setActiveFilter(filter);
              setShowAllEvents(false);
            }}
            styles={screenStyles}
            theme={theme}
          />

          <AlertSearch
            onChange={(value) => {
              setSearch(value);
              setShowAllEvents(false);
            }}
            onClear={() => setSearch('')}
            search={search}
            styles={screenStyles}
            theme={theme}
          />

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
            <AlertState hasIncidents={false} loading styles={screenStyles} theme={theme} />
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

                        <View style={screenStyles.incidentMeta}>
                          <MaterialCommunityIcons name="account-alert-outline" size={14} color={theme.colors.muted} />
                          <Text style={screenStyles.incidentMetaText} numberOfLines={1}>
                            {[incident.reporter?.name || 'Reportante no disponible', incident.route?.name || incident.route?.code].filter(Boolean).join(' · ')}
                          </Text>
                        </View>

                        <View style={screenStyles.metaRow}>
                          <AlertBadge icon={typeStyle.icon} label={typeStyle.label} visualStyle={typeStyle} />
                          <AlertBadge label={statusStyle.label} visualStyle={statusStyle} />
                          <AlertBadge label={severityStyle.label} visualStyle={severityStyle} />
                          {incident.media.length ? (
                            <AlertBadge icon="paperclip" label={`${incident.media.length} ${incident.media.length === 1 ? 'archivo' : 'archivos'}`} visualStyle={INCIDENT_TYPE_STYLES.general} />
                          ) : null}
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
                                ? `${getIncidentUnitLabel(incident)} · GPS${Number.isFinite(Number(incident.location?.accuracy)) ? ` ±${Math.round(Number(incident.location?.accuracy))} m` : ''}${incident.location?.timestamp ? ` · ${formatRelativeTime(incident.location.timestamp)}` : ''}`
                                : incident.locationState === 'stale'
                                  ? `${getIncidentUnitLabel(incident)} · GPS vencido${incident.locationSourceTimestamp ? ` · ${formatRelativeTime(incident.locationSourceTimestamp)}` : ''}`
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
                    {showAllEvents ? 'Mostrar menos' : `Ver mas alertas (${hiddenEventsCount})`}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <AlertState
              hasIncidents={Boolean(incidents.length)}
              loading={false}
              styles={screenStyles}
              theme={theme}
            />
          )}
        </AppCard>
      </View>
    </AppShell>
  );
}
