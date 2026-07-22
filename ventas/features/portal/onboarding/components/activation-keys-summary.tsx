import { Text, View } from 'react-native';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { EmptyState } from '@/src/components/ui/empty-state';
import { formatPortalStatus, getPortalStatusTone } from '../../cards';
import { styles } from '../onboarding.styles';
import { ActivationMetric } from './activation-metric';
import type { PortalActivationKeysSummary } from '@/src/types/app';

export function ActivationKeysSummary({
  summary,
}: {
  summary: PortalActivationKeysSummary | null;
}) {
  if (!summary) {
    return (
      <EmptyState
        icon="clipboard-list-outline"
        title="Sin resumen de activación"
        description="El resumen aparecerá cuando el backend entregue el estado del plan y los cupos disponibles."
      />
    );
  }

  return (
    <View style={styles.metricGrid}>
      <View style={styles.metricTile}>
        <View style={styles.metricHeader}>
          <Text style={styles.metricLabel}>Plan actual</Text>
          <StatusBadge
            label={formatPortalStatus(summary.planStatus)}
            tone={getPortalStatusTone(summary.planStatus)}
          />
        </View>
        <Text style={styles.metricValue}>{summary.planName}</Text>
        <Text style={styles.metricDetail}>{summary.maxUnits} combis incluidas</Text>
      </View>
      <ActivationMetric
        label="Límite"
        value={`${summary.maxDrivers}`}
        detail="conductores / unidades activas"
      />
      <ActivationMetric
        label="Keys"
        value={`${summary.keysGenerated}`}
        detail={`${summary.keysUsed} usadas / ${summary.keysAvailable} disponibles`}
      />
      <ActivationMetric
        label="Cupos disponibles"
        value={`${summary.availableSlots}`}
        detail={`${summary.activeDrivers} conductores activados`}
      />
    </View>
  );
}
