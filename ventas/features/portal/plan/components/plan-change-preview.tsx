import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { formatCurrency } from '@/src/utils/format';
import { PortalSectionCard } from '../../components/portal-cards';
import { PortalButton } from '../../components/portal-button';
import { portalPalette } from '../../portal-theme';
import { styles } from '../plan.styles';
import type { CommercialChangeSummary } from '@/features/commercial';

type ChangePreviewAction = {
  kind: 'continue' | 'checkout' | 'navigate' | 'select' | 'disabled';
  label: string;
  href: '/portal/pagos' | '/portal/perfil?section=soporte' | '/portal/unidades' | null;
};

export function PlanChangePreview({
  action,
  compact,
  comparison,
  isSubmitting,
  onClose,
  onPrimary,
}: {
  action: ChangePreviewAction;
  compact: boolean;
  comparison: CommercialChangeSummary;
  isSubmitting: boolean;
  onClose: () => void;
  onPrimary: () => void;
}) {
  const { currentPlan, targetPlan, unitsDelta, priceDelta, validation } = comparison;
  const actionDisabled = action.kind === 'disabled' || isSubmitting;

  return (
    <PortalSectionCard
      title="Vista previa del cambio"
      subtitle="Compara lo que tienes hoy con la opción seleccionada. Nada se modificará todavía."
      right={
        <StatusBadge
          label={validation.allowed ? 'Cambio disponible' : 'Revisión necesaria'}
          tone={validation.allowed ? 'positive' : 'warning'}
        />
      }>
      <View style={[styles.comparisonFlow, compact ? styles.comparisonFlowCompact : undefined]}>
        <ComparisonPlan
          compact={compact}
          label="Plan actual"
          name={currentPlan.name}
          price={currentPlan.monthlyPrice}
          units={currentPlan.units}
        />
        <View style={styles.comparisonArrow}>
          <MaterialCommunityIcons name={compact ? 'arrow-down' : 'arrow-right'} size={22} color={portalPalette.accent} />
        </View>
        <ComparisonPlan
          compact={compact}
          featured
          label="Nuevo plan"
          name={targetPlan.name}
          price={targetPlan.monthlyPrice}
          units={targetPlan.units}
        />
      </View>

      <View style={styles.changeGrid}>
        <ChangeFact
          icon="bus-multiple"
          label="Capacidad"
          value={unitsDelta === 0 ? 'Misma capacidad' : unitsDelta > 0 ? `+${unitsDelta} unidades` : `${Math.abs(unitsDelta)} unidades menos`}
        />
        <ChangeFact
          icon="cash-sync"
          label="Mensualidad"
          value={priceDelta === 0 ? 'Sin diferencia' : `${priceDelta > 0 ? '+' : '-'}${formatCurrency(Math.abs(priceDelta))}`}
        />
        <ChangeFact
          icon="calendar-refresh-outline"
          label="Estado esperado"
          value={comparison.expectedStateLabel}
        />
        <ChangeFact
          icon="calendar-clock-outline"
          label="Vigencia"
          value={comparison.nextStep.includes('siguiente ciclo') || comparison.nextStep.includes('próximo') ? 'Próximo ciclo de facturación' : 'Inmediato'}
        />
      </View>

      <View style={styles.billingClarity}>
        <MaterialCommunityIcons name="credit-card-check-outline" size={18} color={portalPalette.info} />
        <Text style={styles.billingClarityText}>
          El cobro se realiza al inicio de cada periodo. La renovación es automática. Puedes desactivar la renovación desde Mi plan {'>'} Cancelar suscripción. El cambio aplica al siguiente ciclo de facturación.
        </Text>
      </View>

      <View style={styles.newBenefits}>
        <Text style={styles.newBenefitsTitle}>Lo que obtienes con {targetPlan.name}</Text>
        {comparison.benefits.map((benefit) => (
          <View key={benefit} style={styles.benefitRow}>
            <MaterialCommunityIcons name="check" size={17} color={portalPalette.success} />
            <Text style={styles.benefitText}>{benefit}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.ruleNotice, validation.allowed ? styles.ruleNoticeAllowed : styles.ruleNoticeBlocked]}>
        <MaterialCommunityIcons
          name={validation.allowed ? 'check-decagram-outline' : 'alert-circle-outline'}
          size={20}
          color={validation.allowed ? portalPalette.success : portalPalette.warning}
        />
        <View style={styles.ruleNoticeCopy}>
          <Text style={styles.ruleNoticeTitle}>{validation.reason}</Text>
          <Text style={styles.ruleNoticeText}>{validation.outcome}</Text>
          {validation.restrictions.map((restriction) => (
            <Text key={restriction} style={styles.restrictionText}>• {restriction}</Text>
          ))}
          <Text style={styles.nextStepText}>Siguiente paso: {comparison.nextStep}</Text>
        </View>
      </View>

      <View style={[styles.previewActions, compact ? styles.previewActionsCompact : undefined]}>
        <PortalButton fullWidth={compact} onPress={onClose} variant="secondary">Elegir otro plan</PortalButton>
        <PortalButton
          accessibilityLabel={isSubmitting ? 'Aplicando cambio de plan' : action.label}
          disabled={actionDisabled}
          fullWidth={compact}
          icon={action.kind === 'disabled' ? 'cancel' : 'arrow-right'}
          loading={isSubmitting}
          onPress={onPrimary}
          size="md">
          {isSubmitting ? 'Aplicando...' : action.label}
        </PortalButton>
      </View>
    </PortalSectionCard>
  );
}

function ComparisonPlan({
  featured = false,
  compact,
  label,
  name,
  price,
  units,
}: {
  featured?: boolean;
  compact: boolean;
  label: string;
  name: string;
  price: number;
  units: number;
}) {
  return (
    <View style={[
      styles.comparisonPlan,
      compact ? styles.comparisonPlanCompact : undefined,
      featured ? styles.comparisonPlanFeatured : undefined,
    ]}>
      <Text style={styles.comparisonLabel}>{label}</Text>
      <Text style={styles.comparisonName}>{name}</Text>
      <Text style={styles.comparisonMeta}>{units} unidades · {formatCurrency(price)} al mes</Text>
    </View>
  );
}

function ChangeFact({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.changeFact}>
      <View style={styles.changeFactIcon}>
        <MaterialCommunityIcons name={icon} size={19} color={portalPalette.info} />
      </View>
      <View style={styles.changeFactCopy}>
        <Text style={styles.changeFactLabel}>{label}</Text>
        <Text style={styles.changeFactValue}>{value}</Text>
      </View>
    </View>
  );
}
