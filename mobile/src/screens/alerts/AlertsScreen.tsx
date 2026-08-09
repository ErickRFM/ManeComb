import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { DesignSystem } from '@/constants/theme';
import * as Haptics from '@/src/native/haptics';
import { router, useLocalSearchParams } from '@/src/navigation/router';
import { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  type TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppCard } from '@/src/components/app-card';
import { AppShell } from '@/src/components/app-shell';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import type { IncidentSeverity } from '@/src/types/app';
import { canManageMobileIncidents } from '@/src/utils/mobile-authority';
import {
  INCIDENT_TYPES,
  INITIAL_VISIBLE_EVENTS,
  SEVERITY_STYLES,
  type IncidentFilterKey,
} from './constants/alerts.constants';
import {
  getIncidentContext,
  getSeverityStyle,
  isIncidentActive,
  matchesFilter,
  matchesSearch,
  normalizeSearchValue,
} from './utils/alerts.utils';
import { AlertCard } from './components/AlertCard';
import { AlertsHeader } from './components/AlertsHeader';
import { AlertFilters } from './components/AlertFilters';
import { AlertSearch } from './components/AlertSearch';
import { AlertForm } from './components/AlertForm';
import { AlertState } from './components/AlertState';
import { createStyles } from './alerts.styles';

export function AlertsScreen() {
  const { theme } = useAppTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < DesignSystem.breakpoints.compact;
  const isPhone = width < DesignSystem.breakpoints.phone;

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
  const canManageIncidents = canManageMobileIncidents(user as typeof user & { capabilities?: string[] });

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
            <AlertState hasIncidents={false} loading theme={theme} />
          ) : visibleIncidents.length ? (
            <>
              <ScrollView
                contentContainerStyle={screenStyles.timelineContainer}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                style={screenStyles.timelineScroll}>
                {visibleIncidents.map((incident, index) => {
                  const canResolve = canManageIncidents && isIncidentActive(incident);

                  return (
                    <AlertCard
                      key={incident.id}
                      canResolve={canResolve}
                      incident={incident}
                      onOpenMap={() => router.push({
                        pathname: '/mapa',
                        params: {
                          focusLatitude: String(incident.location?.latitude),
                          focusLongitude: String(incident.location?.longitude),
                        },
                      })}
                      onResolve={() => { updateIncidentStatus(incident.id, 'resolved'); }}
                      showConnector={index < visibleIncidents.length - 1}
                      styles={screenStyles}
                      theme={theme}
                    />
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
              theme={theme}
            />
          )}
        </AppCard>
      </View>
    </AppShell>
  );
}
