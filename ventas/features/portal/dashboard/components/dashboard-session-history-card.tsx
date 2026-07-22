import { Pressable, Text, View } from 'react-native';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { formatPortalStatus, getPortalStatusTone } from '../../cards';
import { styles } from '../dashboard.styles';
import { formatDate, formatDistanceFromMeters, formatDurationFromSeconds } from '@/src/utils/format';
import { formatPercent } from '../dashboard.utils';
import type { RouteSession } from '@/src/types/app';

const formatDuration = formatDurationFromSeconds;
const formatDistance = formatDistanceFromMeters;

export function SessionHistoryCard({
  active,
  driverName,
  onOpen,
  routeLabel,
  session,
  vehicleCode,
}: {
  active: boolean;
  driverName: string;
  onOpen: () => void;
  routeLabel: string;
  session: RouteSession;
  vehicleCode: string;
}) {
  const distance = formatDistance(session.totalDistance);
  const productivity = formatPercent(session.metrics?.effectiveTimePercent);
  const meta = [
    formatDuration(session.totalDuration),
    distance !== '--' ? distance : null,
    `${session.completedLaps ?? 0} vueltas`,
    productivity !== 'Sin dato' ? `${productivity} productividad` : null,
  ].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir jornada de ${vehicleCode}`}
      onPress={onOpen}
      style={[styles.historyCard, active ? styles.historyCardActive : undefined]}>
      <View style={styles.unitHeader}>
        <View style={styles.flex}>
          <Text style={styles.historyTitle}>{vehicleCode} · {formatDate(session.startedAt)}</Text>
          <Text style={styles.unitMeta} numberOfLines={1}>{driverName} · {routeLabel}</Text>
        </View>
        <StatusBadge label={formatPortalStatus(session.status)} tone={getPortalStatusTone(session.status)} />
      </View>
      <Text style={styles.historyMeta}>{meta}</Text>
    </Pressable>
  );
}
