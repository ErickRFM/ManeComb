import { isAxiosError } from 'axios';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { apiClient, getApiErrorMessage } from '@/src/api/client';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { EmptyState } from '@/src/components/ui/empty-state';
import { PortalButton } from '../../components/portal-button';
import { formatPortalStatus, getPortalStatusTone } from '../../cards';
import { usePortalStore } from '../../store/use-portal-store';
import { styles } from '../onboarding.styles';
import { ActivationMetric } from './activation-metric';
import type { PortalActivationKeysSummary } from '@/src/types/app';

type ActivationKeyTtlDays = 1 | 7 | 14 | 30 | null;

const TTL_OPTIONS: ReadonlyArray<{ days: ActivationKeyTtlDays; label: string }> = [
  { days: 1, label: '24 horas' },
  { days: 7, label: '7 días' },
  { days: 14, label: '14 días' },
  { days: 30, label: '30 días' },
  { days: null, label: 'Sin vencimiento' },
];

export function ActivationKeysSummary({
  summary,
}: {
  summary: PortalActivationKeysSummary | null;
}) {
  const [ttlDays, setTtlDays] = useState<ActivationKeyTtlDays>(14);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const { loadOverview } = usePortalStore(
    useShallow((state) => ({ loadOverview: state.loadOverview }))
  );

  if (!summary) {
    return (
      <EmptyState
        icon="clipboard-list-outline"
        title="Sin resumen de activación"
        description="El resumen aparecerá cuando el backend entregue el estado del plan y los cupos disponibles."
      />
    );
  }

  const canGenerate = summary.availableSlots > 0 && !busy;
  const generate = async () => {
    if (!canGenerate) return;
    setBusy(true);
    setFeedback(null);
    try {
      await apiClient.post('/admin/activation-keys/generate', { expiresInDays: ttlDays });
      await loadOverview();
      setFeedback(
        ttlDays === null
          ? 'Key generada sin vencimiento.'
          : `Key generada con vigencia de ${ttlDays === 1 ? '24 horas' : `${ttlDays} días`}.`
      );
    } catch (error) {
      setFeedback(
        isAxiosError(error)
          ? getApiErrorMessage(error, 'No fue posible generar la key.')
          : 'No fue posible generar la key.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
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
        <ActivationMetric label="Cupos" value={`${summary.availableSlots}`} detail={`${summary.activeDrivers} conductores activos`} />
        <ActivationMetric label="Disponibles" value={`${summary.keysAvailable}`} detail="listas para compartir" />
        <ActivationMetric label="Usadas" value={`${summary.keysUsed}`} detail="evidencia conservada" />
        <ActivationMetric label="Expiradas" value={`${summary.keysExpired || 0}`} detail="ya no pueden utilizarse" />
        <ActivationMetric label="Revocadas" value={`${summary.keysRevoked || 0}`} detail={`${summary.keysGenerated} generadas en total`} />
      </View>

      <View style={{ gap: 9 }}>
        <Text style={styles.keyMeta}>Vigencia de la próxima key de un solo uso</Text>
        <View style={{ alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TTL_OPTIONS.map((option) => (
            <PortalButton
              key={option.label}
              onPress={() => setTtlDays(option.days)}
              size="sm"
              variant={ttlDays === option.days ? 'primary' : 'secondary'}>
              {option.label}
            </PortalButton>
          ))}
          <PortalButton
            disabled={!canGenerate}
            icon="key-plus"
            loading={busy}
            onPress={() => void generate()}
            size="sm">
            Generar key
          </PortalButton>
        </View>
        <Text style={styles.keyMeta}>
          La key deja de funcionar al usarse o ser revocada. Si tiene vigencia, también al vencer.
        </Text>
        {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
      </View>
    </View>
  );
}
