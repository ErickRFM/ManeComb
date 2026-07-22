import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { formatCurrency, formatDate } from '@/src/utils/format';
import { portalGlass, portalPalette } from '../../portal-theme';
import { styles } from '../plan.styles';
import type { CommercialPlanView, CommercialStatePresentation } from '@/features/commercial';
import type { PortalSubscription } from '@/src/types/app';

export function PlanCurrentSummary({
  currentPlan,
  state,
  subscription,
  canCancel,
  onCancel,
}: {
  currentPlan: CommercialPlanView | null;
  state: CommercialStatePresentation;
  subscription: PortalSubscription | null;
  canCancel?: boolean;
  onCancel?: () => void;
}) {
  if (!subscription || !currentPlan) {
    return null;
  }

  const totalUnits = Number(subscription.totalUnits || currentPlan?.units || 0);
  const activeUnits = Number(subscription.activeUnits || 0);
  const usagePercent = totalUnits ? Math.min(100, Math.round((activeUnits / totalUnits) * 100)) : 0;
  const monthlyPrice = subscription.monthlyPrice ?? currentPlan?.price ?? 0;
  const description = currentPlan?.description || 'Cobertura comercial para administrar tu operación desde ManeComb.';

  return (
    <View style={[styles.currentPlanCard, portalGlass()]}>
      <View style={styles.currentPlanHeader}>
        <View style={styles.currentPlanIdentity}>
          <Text style={styles.eyebrow}>Plan actual</Text>
          <Text style={styles.currentPlanName}>{currentPlan?.displayName || subscription.planName || 'Plan ManeComb'}</Text>
          <Text style={styles.currentPlanDescription}>{description}</Text>
        </View>
        <StatusBadge
          label={state.label}
          tone={state.tone}
        />
      </View>

      <View style={styles.currentMetrics}>
        <PlanFact label="Precio mensual" value={formatCurrency(monthlyPrice, subscription.currency || 'MXN')} />
        <PlanFact label="Unidades incluidas" value={String(totalUnits)} />
        <PlanFact label="Unidades utilizadas" value={`${activeUnits} de ${totalUnits}`} />
        <PlanFact
          label="Fin del periodo"
          value={formatDate(subscription.currentPeriodEnd, { fallback: 'Por confirmar' })}
        />
      </View>

      <View style={styles.usageBlock}>
        <View style={styles.usageHeader}>
          <Text style={styles.usageLabel}>Uso del plan</Text>
          <Text style={styles.usageValue}>{usagePercent}%</Text>
        </View>
        <View style={styles.usageTrack}>
          <View style={[styles.usageFill, { width: `${usagePercent}%` }]} />
        </View>
        <Text style={styles.usageHint}>{state.message}</Text>
      </View>
      {canCancel && onCancel ? (
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          style={styles.cancelSubscriptionButton}>
          <MaterialCommunityIcons name="close-circle-outline" size={18} color={portalPalette.danger} />
          <Text style={styles.cancelSubscriptionText}>Cancelar suscripción</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PlanFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.planFact}>
      <Text style={styles.planFactLabel}>{label}</Text>
      <Text style={styles.planFactValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}
