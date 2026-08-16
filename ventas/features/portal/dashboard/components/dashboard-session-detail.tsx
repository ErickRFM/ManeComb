import { lazy, Suspense } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { EmptyState } from '@/src/components/ui/empty-state';
import { formatDate, formatDistanceFromMeters, formatDurationFromSeconds } from '@/src/utils/format';
import type { RouteSession, RouteSessionPosition, RouteEvent } from '@/src/types/app';
import { PortalSectionCard } from '../../cards';
import { PortalButton } from '../../components/portal-button';
import { PortalDataList, PortalDataRow } from '../../components/portal-data-list';
import { portalPalette } from '../../portal-theme';
import { styles } from '../dashboard.styles';
import type { SessionDetail } from '../dashboard.types';
import { replaySpeeds } from '../dashboard.constants';
import { formatPercent, formatSpeedMetersPerSecond, getEventLabel, getTimestamp } from '../dashboard.utils';

const formatDuration = formatDurationFromSeconds;
const formatDistance = formatDistanceFromMeters;

const OperationsMap = lazy(() => import('../../components/operations-map').then((module) => ({ default: module.OperationsMap })));

function MapFallback({ height = 410 }: { height?: number }) {
  return (
    <View style={[styles.mapFallback, { minHeight: height }]}>
      <Text style={styles.loadingText}>Cargando mapa...</Text>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress: () => void }) {
  return <PortalButton icon={icon} onPress={onPress} size="sm" variant="ghost">{label}</PortalButton>;
}

export function SessionDetailView({
  detail,
  isLoading,
  isPositionsLoading,
  onEventSelect,
  onLoadMorePositions,
  onReplayIndexChange,
  onReplayPlayingChange,
  onReplaySpeedChange,
  replayIndex,
  replayPath,
  replayPlaying,
  replayPosition,
  replaySpeed,
  session,
}: {
  detail: SessionDetail | null;
  isLoading: boolean;
  isPositionsLoading: boolean;
  onEventSelect: (event: RouteEvent) => void;
  onLoadMorePositions: () => void;
  onReplayIndexChange: (index: number) => void;
  onReplayPlayingChange: (playing: boolean) => void;
  onReplaySpeedChange: (speed: (typeof replaySpeeds)[number]) => void;
  replayIndex: number;
  replayPath: RouteSessionPosition[];
  replayPlaying: boolean;
  replayPosition: RouteSessionPosition | null;
  replaySpeed: (typeof replaySpeeds)[number];
  session: RouteSession;
}) {
  if (isLoading) {
    return <Text style={styles.loadingText}>Cargando jornada...</Text>;
  }
  if (!detail) {
    return (
      <View style={styles.replayEmptyNote}>
        <MaterialCommunityIcons name="database-search-outline" size={18} color={portalPalette.muted} />
        <Text style={styles.unitMeta}>Abre el detalle para consultar eventos y posiciones persistidas.</Text>
      </View>
    );
  }
  const maxIndex = Math.max(0, detail.positions.length - 1);
  const currentVisit = detail.visits.find((visit) => getTimestamp(visit.timestamp) <= getTimestamp(replayPosition?.timestamp));
  const hasMorePositions = detail.positionsOffset < detail.positionsTotal;
  const hasPositions = detail.positions.length > 0;
  return (
    <View style={styles.sessionDetail}>
      <View style={styles.metricGrid}>
        <Fact label="Duracion" value={formatDuration(session.totalDuration)} />
        <Fact label="Distancia" value={formatDistance(session.totalDistance)} />
        <Fact label="Vueltas" value={String(session.completedLaps ?? 0)} />
        <Fact label="Productividad" value={formatPercent(session.metrics?.effectiveTimePercent)} />
      </View>
      <View style={styles.operationsGrid}>
        <View style={styles.replayPanel}>
          <Suspense fallback={<MapFallback height={250} />}>
            <OperationsMap
              height={250}
              replayPath={replayPath}
              replayPosition={replayPosition}
              routeCoordinates={replayPath.map((position) => ({ latitude: position.latitude, longitude: position.longitude }))}
              variant="replay"
              vehicles={[]}
            />
          </Suspense>
          {hasPositions ? (
            <>
              <View style={styles.replayControls}>
                <QuickAction icon={replayPlaying ? 'pause' : 'play'} label={replayPlaying ? 'Pausar' : 'Reproducir'} onPress={() => onReplayPlayingChange(!replayPlaying)} />
                {replaySpeeds.map((speed) => (
                  <Pressable key={speed} onPress={() => onReplaySpeedChange(speed)} style={[styles.filterChip, replaySpeed === speed ? styles.filterChipActive : undefined]}>
                    <Text style={styles.filterChipText}>{speed}x</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.sliderTrack}>
                <View style={[styles.sliderFill, { width: `${maxIndex ? (replayIndex / maxIndex) * 100 : 0}%` }]} />
              </View>
              <View style={styles.replaySteps}>
                <PortalButton onPress={() => onReplayIndexChange(Math.max(0, replayIndex - 1))} size="sm" variant="secondary">Anterior</PortalButton>
                <PortalButton onPress={() => onReplayIndexChange(Math.min(maxIndex, replayIndex + 1))} size="sm" variant="secondary">Siguiente</PortalButton>
                {hasMorePositions ? (
                  <PortalButton loading={isPositionsLoading} onPress={onLoadMorePositions} size="sm" variant="secondary">Cargar más posiciones</PortalButton>
                ) : null}
              </View>
              <View style={styles.metricGrid}>
                <Fact label="Hora" value={replayPosition ? formatDate(replayPosition.timestamp) : 'Sin posición'} />
                <Fact label="Velocidad" value={formatSpeedMetersPerSecond(replayPosition?.speed)} />
                <Fact label="Checkpoint" value={currentVisit ? `#${detail.visits.indexOf(currentVisit) + 1}` : 'Sin checkpoint'} />
                <Fact label="GPS" value={replayPosition?.gpsQuality || 'Sin calidad'} />
                <Fact label="Posiciones" value={`${detail.positions.length} / ${detail.positionsTotal || detail.positions.length}`} />
              </View>
            </>
          ) : (
            <View style={styles.replayEmptyNote}>
              <MaterialCommunityIcons name="information-outline" size={16} color={portalPalette.muted} />
              <Text style={styles.unitMeta}>La reproducción se activa cuando la jornada registra posiciones GPS. Los eventos siguen disponibles a un lado.</Text>
            </View>
          )}
        </View>

        <View style={styles.timelinePanel}>
          <Text style={styles.panelTitle}>Eventos del recorrido</Text>
          {detail.events.length ? (
            <View style={styles.timelineList}>
              {detail.events.map((event) => (
                <Pressable key={event.id} onPress={() => onEventSelect(event)} style={styles.timelineItem}>
                  <View style={styles.timelineDot}>
                    <MaterialCommunityIcons name={event.eventType === 'CHECKPOINT_REACHED' ? 'flag-checkered' : 'clock-outline'} size={14} color={portalPalette.text} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.timelineTitle}>{getEventLabel(event.eventType)}</Text>
                    <Text style={styles.unitMeta}>{formatDate(event.timestamp)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <EmptyState icon="timeline-clock-outline" title="Sin eventos" description="La jornada no tiene eventos registrados." />
          )}
        </View>
      </View>
      <View style={styles.detailGrid}>
        <PortalSectionCard title="Checkpoints" subtitle={`${detail.visits.length} visitas persistidas`}>
          {detail.visits.length ? <PortalDataList>{detail.visits.slice(0, 12).map((visit, index) => (
            <PortalDataRow key={visit.id} body={<Text style={styles.compactTitle}>Checkpoint #{index + 1}</Text>} meta={<Text style={styles.unitMeta}>{formatDate(visit.timestamp)}</Text>} />
          ))}</PortalDataList> : <EmptyState icon="flag-outline" title="Sin checkpoints" description="No existen visitas registradas para esta jornada." />}
        </PortalSectionCard>
        <PortalSectionCard title="GPS" subtitle="Cobertura y precisión registradas">
          {hasPositions ? (
            <View style={styles.metricGrid}>
              <Fact label="Cobertura" value={formatPercent(detail.metrics?.metrics?.gpsCoveragePercent)} />
              <Fact label="Precision prom." value={detail.metrics?.averageGpsAccuracy ? `${detail.metrics.averageGpsAccuracy} m` : 'Sin dato'} />
              <Fact label="GOOD" value={formatPercent(detail.metrics?.metrics?.gpsQuality?.goodPercent)} />
              <Fact label="NORMAL" value={formatPercent(detail.metrics?.metrics?.gpsQuality?.normalPercent)} />
              <Fact label="BAD" value={formatPercent(detail.metrics?.metrics?.gpsQuality?.badPercent)} />
              <Fact label="Posiciones" value={String(detail.positions.length)} />
            </View>
          ) : (
            <EmptyState icon="satellite-variant" title="Sin datos de GPS" description="Esta jornada no registró posiciones GPS. No hay cobertura ni calidad para mostrar." />
          )}
        </PortalSectionCard>
      </View>
    </View>
  );
}
