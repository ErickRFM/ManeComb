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
        label="Cupos"
        value={`${summary.availableSlots}`}
        detail={`${summary.activeDrivers} conductores activos`}
      />
      <ActivationMetric
        label="Disponibles"
        value={`${summary.keysAvailable}`}
        detail="listas para compartir"
      />
      <ActivationMetric
        label="Usadas"
        value={`${summary.keysUsed}`}
        detail="con evidencia conservada"
      />
      <ActivationMetric
        label="Expiradas"
        value={`${summary.keysExpired || 0}`}
        detail="ya no pueden utilizarse"
      />
      <ActivationMetric
        label="Revocadas"
        value={`${summary.keysRevoked || 0}`}
        detail={`${summary.keysGenerated} generadas en total`}
      />
    </View>
  );
}
