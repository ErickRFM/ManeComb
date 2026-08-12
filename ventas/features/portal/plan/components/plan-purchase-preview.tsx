import { Text, View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { AppTheme, Typography } from '@/constants/theme';
import { formatCurrency } from '@/src/utils/format';
import type { CommercialPlanView } from '@/features/commercial';
import { PortalSectionCard } from '../../cards';
import { PortalButton } from '../../components/portal-button';
import { portalPalette } from '../../portal-theme';

export function PlanPurchasePreview({
  actionLabel,
  compact,
  isSubmitting,
  onClose,
  onPrimary,
  plan,
}: {
  actionLabel: string;
  compact: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onPrimary: () => void;
  plan: CommercialPlanView;
}) {
  return (
    <PortalSectionCard
      title="Resumen de compra"
      subtitle="Revisa el plan seleccionado antes de continuar al pago.">
      <View style={styles.summary}>
        <View style={styles.planIdentity}>
          <View style={styles.iconBox}>
            <MaterialCommunityIcons name="bus-multiple" size={22} color={portalPalette.accent} />
          </View>
          <View style={styles.planCopy}>
            <Text style={styles.planName}>{plan.displayName}</Text>
            <Text style={styles.planMeta}>{plan.units} combis · {formatCurrency(plan.price)} al mes</Text>
          </View>
        </View>

        <View style={styles.benefits}>
          {plan.benefits.map((benefit) => (
            <View key={benefit} style={styles.benefitRow}>
              <MaterialCommunityIcons name="check-circle-outline" size={17} color={portalPalette.success} />
              <Text style={styles.benefitText}>{benefit}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.actions, compact ? styles.actionsCompact : undefined]}>
        <PortalButton fullWidth={compact} onPress={onClose} variant="secondary">
          Elegir otro plan
        </PortalButton>
        <PortalButton
          accessibilityLabel={actionLabel}
          fullWidth={compact}
          icon="arrow-right"
          loading={isSubmitting}
          onPress={onPrimary}
          size="md">
          {actionLabel}
        </PortalButton>
      </View>
    </PortalSectionCard>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: AppTheme.spacing.md,
  },
  planIdentity: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: AppTheme.spacing.sm,
  },
  iconBox: {
    alignItems: 'center',
    backgroundColor: portalPalette.accentSoft,
    borderColor: 'rgba(255, 77, 125, 0.28)',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  planCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  planName: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 18,
    fontWeight: '900',
  },
  planMeta: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
  },
  benefits: {
    gap: AppTheme.spacing.xs,
  },
  benefitRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: AppTheme.spacing.xs,
  },
  benefitText: {
    color: portalPalette.text,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppTheme.spacing.sm,
    justifyContent: 'flex-end',
  },
  actionsCompact: {
    flexDirection: 'column',
  },
});
