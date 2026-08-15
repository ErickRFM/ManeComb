import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { useAppStore } from '@/src/store/use-app-store';
import { getApiErrorMessage } from '@/src/lib/api';
import { PortalButton } from '../components/portal-button';
import { portalPalette } from '../portal-theme';
import {
  approveLearnedRouteSegmentRequest,
  getLearnedRouteSegmentsRequest,
  rejectLearnedRouteSegmentRequest,
  type LearnedRouteSegmentReview,
} from '../routes/learned-route-segment.api';

type Props = {
  onApplied: () => void;
};

function formatEvidence(candidate: LearnedRouteSegmentReview) {
  const runs = candidate.evidenceCount || 0;
  const days = candidate.distinctServiceDays || 0;
  const vehicles = candidate.vehicleCount || candidate.evidenceVehicleIds?.length || 1;
  return `${runs} ${runs === 1 ? 'recorrido' : 'recorridos'} · ${days} ${days === 1 ? 'día' : 'días'} · ${vehicles} ${vehicles === 1 ? 'unidad' : 'unidades'}`;
}

function formatDistanceDelta(value: number) {
  const rounded = Math.round(value || 0);
  if (!rounded) return 'sin cambio';
  return `${rounded < 0 ? '−' : '+'}${Math.abs(rounded)} m`;
}

function formatDurationDelta(value: number) {
  const seconds = Math.round(value || 0);
  if (!seconds) return 'sin cambio';
  const minutes = Math.max(1, Math.round(Math.abs(seconds) / 60));
  return `${seconds < 0 ? '−' : '+'}${minutes} min`;
}

export function RouteLearningV3Review({ onApplied }: Props) {
  const user = useAppStore((state) => state.user);
  const canReview = Boolean(user && ['owner', 'admin'].includes(user.role));
  const { height, width } = useWindowDimensions();
  const [candidates, setCandidates] = useState<LearnedRouteSegmentReview[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canReview) return;
    try {
      const next = await getLearnedRouteSegmentsRequest();
      setCandidates(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id || null);
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible revisar las mejoras de ruta.'));
    }
  }, [canReview]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedId) || candidates[0] || null,
    [candidates, selectedId]
  );

  if (!canReview || (!candidates.length && !message)) return null;

  const panelWidth = Math.min(390, Math.max(286, width - 32));
  const panelHeight = Math.max(380, Math.min(650, height - 112));

  const removeCandidate = (candidateId: string) => {
    setCandidates((current) => current.filter((candidate) => candidate.id !== candidateId));
    setSelectedId((current) => current === candidateId ? null : current);
  };

  const apply = async () => {
    if (!selected || selected.segment.stale || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await approveLearnedRouteSegmentRequest(selected.id);
      removeCandidate(selected.id);
      setMessage(`Mejora aplicada a ${response.route.name}. Revisión ${response.application.previousRevision ?? selected.segment.baseRouteRevision} → ${response.route.revision}.`);
      onApplied();
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'La mejora no pudo aplicarse. La ruta no fue modificada.'));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await rejectLearnedRouteSegmentRequest(selected.id);
      removeCandidate(selected.id);
      setMessage('Se mantiene la ruta actual. La evidencia quedó cerrada como rechazada.');
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No fue posible cerrar esta sugerencia.'));
    } finally {
      setBusy(false);
    }
  };

  if (!expanded) {
    return (
      <View pointerEvents="box-none" style={styles.layer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${candidates.length} mejoras de ruta detectadas`}
          onPress={() => setExpanded(true)}
          style={[styles.trigger, { width: panelWidth }]}>
          <View style={styles.triggerIcon}>
            <MaterialCommunityIcons name="auto-fix" size={18} color="#FFFFFF" />
          </View>
          <View style={styles.triggerCopy}>
            <Text style={styles.triggerTitle}>Mejoras detectadas</Text>
            <Text style={styles.triggerText}>
              {candidates.length ? `${candidates.length} ${candidates.length === 1 ? 'tramo listo' : 'tramos listos'} para revisar` : message}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-up" size={20} color={portalPalette.muted} />
        </Pressable>
      </View>
    );
  }

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <View style={[styles.panel, { width: panelWidth, maxHeight: panelHeight }]}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>ROUTE LEARNING</Text>
            <Text style={styles.title}>Mejoras detectadas</Text>
            <Text style={styles.subtitle}>Variantes repetidas entre salida y reincorporación. Ningún tramo cambia sin tu aprobación.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar mejoras" onPress={() => setExpanded(false)} style={styles.closeButton}>
            <MaterialCommunityIcons name="close" size={19} color={portalPalette.text} />
          </Pressable>
        </View>

        {message ? (
          <View style={styles.feedback}>
            <MaterialCommunityIcons name="information-outline" size={16} color={portalPalette.info} />
            <Text style={styles.feedbackText}>{message}</Text>
          </View>
        ) : null}

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {candidates.map((candidate) => {
            const active = candidate.id === selected?.id;
            return (
              <Pressable key={candidate.id} onPress={() => setSelectedId(candidate.id)} style={[styles.candidate, active && styles.candidateActive]}>
                <View style={styles.candidateTop}>
                  <Text numberOfLines={1} style={styles.candidateRoute}>{candidate.segment.routeName}</Text>
                  <StatusBadge label={`${Math.round((candidate.confidence || 0) * 100)}%`} tone={candidate.segment.stale ? 'warning' : 'info'} />
                </View>
                <Text style={styles.candidateEvidence}>{formatEvidence(candidate)}</Text>
              </Pressable>
            );
          })}

          {selected ? (
            <View style={styles.detail}>
              <View style={styles.detailHeader}>
                <View style={styles.detailHeaderCopy}>
                  <Text style={styles.detailTitle}>{selected.segment.routeName}</Text>
                  <Text style={styles.detailMeta}>Revisión base {selected.segment.baseRouteRevision}{selected.segment.currentRouteRevision ? ` · actual ${selected.segment.currentRouteRevision}` : ''}</Text>
                </View>
                <StatusBadge label={selected.segment.stale ? 'Obsoleta' : 'Lista'} tone={selected.segment.stale ? 'warning' : 'info'} />
              </View>

              <View style={styles.metrics}>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Tramo observado</Text>
                  <Text style={styles.metricValue}>{(selected.distanceMeters / 1000).toFixed(2)} km</Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Distancia</Text>
                  <Text style={styles.metricValue}>{formatDistanceDelta(selected.segment.distanceDeltaMeters)}</Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Tiempo estimado</Text>
                  <Text style={styles.metricValue}>{formatDurationDelta(selected.segment.durationDeltaSeconds)}</Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Confianza</Text>
                  <Text style={styles.metricValue}>{Math.round((selected.confidence || 0) * 100)}%</Text>
                </View>
              </View>

              {selected.segment.stale ? (
                <View style={styles.staleNotice}>
                  <MaterialCommunityIcons name="source-branch-sync" size={17} color={portalPalette.warning} />
                  <Text style={styles.staleText}>La ruta cambió después de generar esta evidencia. No se puede aplicar sobre una revisión nueva.</Text>
                </View>
              ) : null}

              <View style={styles.actions}>
                <PortalButton disabled={busy} onPress={() => void reject()} size="sm" variant="secondary">Mantener actual</PortalButton>
                <PortalButton disabled={selected.segment.stale} loading={busy} onPress={() => void apply()} size="sm">Aplicar mejora</PortalButton>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', right: 16, top: 82, zIndex: 40, alignItems: 'flex-end' },
  trigger: { minHeight: 64, borderRadius: 18, borderWidth: 1, borderColor: portalPalette.line, backgroundColor: portalPalette.surfaceStrong, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  triggerIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: portalPalette.info },
  triggerCopy: { flex: 1, minWidth: 0 },
  triggerTitle: { color: portalPalette.text, fontSize: 14, fontWeight: '800' },
  triggerText: { color: portalPalette.muted, fontSize: 12, marginTop: 2 },
  panel: { borderRadius: 22, borderWidth: 1, borderColor: portalPalette.line, backgroundColor: portalPalette.surfaceStrong, overflow: 'hidden', shadowColor: '#000000', shadowOpacity: 0.22, shadowRadius: 26, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  header: { padding: 16, paddingBottom: 12, flexDirection: 'row', gap: 12, borderBottomWidth: 1, borderBottomColor: portalPalette.line },
  headerCopy: { flex: 1 },
  eyebrow: { color: portalPalette.info, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: portalPalette.text, fontSize: 20, fontWeight: '900', marginTop: 3 },
  subtitle: { color: portalPalette.muted, fontSize: 12, lineHeight: 17, marginTop: 5 },
  closeButton: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: portalPalette.surfaceSoft },
  feedback: { marginHorizontal: 14, marginTop: 12, borderRadius: 12, padding: 10, flexDirection: 'row', gap: 8, backgroundColor: portalPalette.infoSoft },
  feedbackText: { flex: 1, color: portalPalette.text, fontSize: 12, lineHeight: 17 },
  scroll: { flexGrow: 0 },
  scrollContent: { padding: 14, gap: 8 },
  candidate: { borderRadius: 14, borderWidth: 1, borderColor: portalPalette.line, padding: 11, backgroundColor: portalPalette.surfaceSoft },
  candidateActive: { borderColor: portalPalette.info },
  candidateTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  candidateRoute: { flex: 1, color: portalPalette.text, fontSize: 13, fontWeight: '800' },
  candidateEvidence: { color: portalPalette.muted, fontSize: 11, marginTop: 5 },
  detail: { marginTop: 4, borderRadius: 16, borderWidth: 1, borderColor: portalPalette.line, padding: 13, backgroundColor: portalPalette.surface },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' },
  detailHeaderCopy: { flex: 1, minWidth: 0 },
  detailTitle: { color: portalPalette.text, fontSize: 16, fontWeight: '900' },
  detailMeta: { color: portalPalette.muted, fontSize: 11, marginTop: 3 },
  metrics: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { minWidth: '47%', flexGrow: 1, borderRadius: 12, padding: 10, backgroundColor: portalPalette.surfaceSoft },
  metricLabel: { color: portalPalette.muted, fontSize: 10, fontWeight: '700' },
  metricValue: { color: portalPalette.text, fontSize: 14, fontWeight: '900', marginTop: 4 },
  staleNotice: { marginTop: 10, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: portalPalette.warningSoft },
  staleText: { flex: 1, color: portalPalette.muted, fontSize: 11, lineHeight: 16 },
  actions: { marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
