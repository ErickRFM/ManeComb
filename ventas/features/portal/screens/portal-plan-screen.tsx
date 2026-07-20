import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { SkeletonBlock } from '@/src/components/ui/skeleton';
import { StatusBadge, type StatusBadgeTone } from '@/src/components/ui/status-badge';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { formatCurrency, formatDate } from '@/src/utils/format';
import { router } from '@/src/navigation/router';
import type { PortalSubscription } from '@/src/types/app';
import {
  CommercialActivityList,
  useCommercialExperience,
  type CommercialChangeSummary,
  type CommercialPlanView,
  type CommercialStatePresentation,
} from '@/features/commercial';
import { PortalSectionCard } from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { PortalButton } from '../components/portal-button';
import { portalButtonGradient, portalGlass, portalPalette } from '../portal-theme';

function CurrentPlanOverview({
  currentPlan,
  state,
  subscription,
}: {
  currentPlan: CommercialPlanView | null;
  state: CommercialStatePresentation;
  subscription: PortalSubscription | null;
}) {
  if (!subscription || !currentPlan) {
    return (
      <EmptyState
        icon="clipboard-list-outline"
        title="Aún no tienes un plan activo"
        description="Explora las opciones disponibles y compara la que mejor se adapte a tu operación."
      />
    );
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

function CommercialPlanCard({
  active,
  plan,
  selected,
  onSelect,
}: {
  active: boolean;
  plan: CommercialPlanView;
  selected: boolean;
  onSelect: () => void;
}) {
  const indicator = active ? 'Plan actual' : plan.indicator;
  const indicatorTone: StatusBadgeTone = active ? 'positive' : plan.id === 'value-4' ? 'info' : 'neutral';

  return (
    <View style={[styles.planCard, selected ? styles.planCardSelected : undefined, active ? styles.planCardActive : undefined]}>
      <View style={styles.planCardHeader}>
        <View style={styles.planCardTitleWrap}>
          <Text style={styles.planName}>{plan.displayName}</Text>
          <Text style={styles.planDescription}>{plan.description}</Text>
        </View>
        <StatusBadge label={indicator} tone={indicatorTone} />
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.planPrice}>{formatCurrency(plan.price)}</Text>
        <Text style={styles.pricePeriod}>al mes</Text>
      </View>
      <Text style={styles.unitPrice}>
        {plan.units} unidades incluidas · aprox. {formatCurrency(plan.pricePerVehicle)} por unidad
      </Text>

      <View style={styles.benefitList}>
        {plan.benefits.map((benefit) => (
          <View key={benefit} style={styles.benefitRow}>
            <MaterialCommunityIcons name="check-circle-outline" size={17} color={portalPalette.success} />
            <Text style={styles.benefitText}>{benefit}</Text>
          </View>
        ))}
      </View>

      {active ? (
        <View style={styles.currentPlanAction}>
          <MaterialCommunityIcons name="check" size={17} color={portalPalette.success} />
          <Text style={styles.currentPlanActionText}>Este es tu plan actual</Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Comparar plan ${plan.displayName}`}
          accessibilityState={{ selected }}
          onPress={onSelect}
          style={[styles.compareButton, selected ? portalButtonGradient() : undefined]}>
          <Text style={[styles.compareButtonText, selected ? styles.compareButtonTextSelected : undefined]}>
            {selected ? 'Seleccionado' : 'Comparar'}
          </Text>
          <MaterialCommunityIcons
            name={selected ? 'check' : 'arrow-right'}
            size={17}
            color={selected ? '#FFFFFF' : portalPalette.text}
          />
        </Pressable>
      )}
    </View>
  );
}

function ChangePreview({
  action,
  compact,
  comparison,
  isSubmitting,
  onClose,
  onPrimary,
}: {
  action: {
    kind: 'continue' | 'checkout' | 'navigate' | 'select' | 'disabled';
    label: string;
    href: '/portal/pagos' | '/portal/perfil?section=soporte' | '/portal/unidades' | null;
  };
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

export function PortalPlanScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const {
    actionMessage,
    cancelSubscription,
    clearSelection,
    comparison,
    comparisonAction,
    continuePreview,
    isLoading,
    isSubmitting,
    plansError,
    reloadPlans,
    selectPlan,
    selectedPlanId,
    workspace,
  } = useCommercialExperience();
  const [cancelOpen, setCancelOpen] = useState(false);
  const plans = workspace?.plans || [];
  const subscription = workspace?.subscription || null;
  const currentPlan = workspace?.currentPlan || null;
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) || null;
  const canCancel = workspace?.state.state === 'ACTIVE' || workspace?.state.state === 'TRIAL';

  const runPrimaryAction = () => {
    if (!comparisonAction) return;
    if (comparisonAction.kind === 'continue') {
      void continuePreview();
      return;
    }
    if (comparisonAction.kind === 'navigate' && comparisonAction.href) {
      router.push(comparisonAction.href as never);
      return;
    }
    if (comparisonAction.kind === 'checkout' && selectedPlan) {
      router.push({ pathname: '/ventas/pago', params: { planId: selectedPlan.id } } as never);
      return;
    }
    if (comparisonAction.kind === 'select') clearSelection();
  };

  return (
    <PortalLayout title="Mi plan" subtitle="Conoce tu cobertura actual y compara opciones antes de tomar una decisión.">
      <PortalSectionCard title="Tu suscripción" subtitle="La información esencial de tu plan, sin cargos ni cambios ocultos.">
        {workspace ? (
          <View style={styles.subscriptionContent}>
            <CurrentPlanOverview currentPlan={currentPlan} state={workspace.state} subscription={subscription} />
            {canCancel ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setCancelOpen(true)}
                style={styles.cancelSubscriptionButton}>
                <MaterialCommunityIcons name="close-circle-outline" size={18} color={portalPalette.danger} />
                <Text style={styles.cancelSubscriptionText}>Cancelar suscripción</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.currentPlanCard}>
            <SkeletonBlock height={22} width="35%" />
            <SkeletonBlock height={38} width="55%" />
            <SkeletonBlock height={80} />
          </View>
        )}
      </PortalSectionCard>

      <PortalSectionCard title="Compara planes" subtitle="Elige una opción para ver exactamente qué cambiaría.">
        {actionMessage ? (
          <View style={styles.actionFeedback}>
            <MaterialCommunityIcons name="information-outline" size={18} color={portalPalette.info} />
            <Text style={styles.actionFeedbackText}>{actionMessage}</Text>
          </View>
        ) : null}
        {isLoading ? (
          <View style={styles.planGrid}>
            {[0, 1, 2].map((item) => (
              <View key={item} style={styles.planSkeleton}>
                <SkeletonBlock height={24} width="55%" />
                <SkeletonBlock height={42} width="70%" />
                <SkeletonBlock height={16} />
                <SkeletonBlock height={16} width="85%" />
              </View>
            ))}
          </View>
        ) : plansError ? (
          <View style={styles.plansErrorState}>
            <EmptyState
              icon="cloud-alert-outline"
              title="No pudimos cargar los planes"
              description={plansError}
            />
            <Pressable accessibilityRole="button" onPress={() => void reloadPlans()} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : plans.length ? (
          <View style={styles.planGridWrapper}>
            <View style={styles.planGrid}>
              {plans.map((plan) => (
                <CommercialPlanCard
                  key={plan.id}
                  active={plan.id === currentPlan?.id}
                  plan={plan}
                  selected={plan.id === selectedPlanId}
                  onSelect={() => void selectPlan(plan.id)}
                />
              ))}
            </View>
          </View>
        ) : (
          <EmptyState
            icon="clipboard-list-outline"
            title="No hay planes disponibles por ahora"
            description="Vuelve a intentarlo más tarde. Tu suscripción actual no sufrirá cambios."
          />
        )}
      </PortalSectionCard>

      {selectedPlan && comparison && comparisonAction ? (
        <ChangePreview
          action={comparisonAction}
          compact={compact}
          comparison={comparison}
          isSubmitting={isSubmitting}
          onClose={clearSelection}
          onPrimary={runPrimaryAction}
        />
      ) : (
        <View style={styles.comparisonEmpty}>
          <View style={styles.comparisonEmptyIcon}>
            <MaterialCommunityIcons name="compare-horizontal" size={24} color={portalPalette.info} />
          </View>
          <View style={styles.comparisonEmptyCopy}>
            <Text style={styles.comparisonEmptyTitle}>Selecciona un plan para compararlo</Text>
            <Text style={styles.comparisonEmptyText}>
              Verás capacidad, mensualidad y beneficios antes de continuar. No aplicaremos ningún cambio.
            </Text>
          </View>
        </View>
      )}

      {workspace?.activities.length ? (
        <PortalSectionCard title="Historial comercial" subtitle="Movimientos recientes de tu suscripción.">
          <CommercialActivityList activities={workspace.activities} />
        </PortalSectionCard>
      ) : null}
      <ConfirmModal
        visible={cancelOpen}
        destructive
        title="Cancelar suscripción"
        description={`La cancelación será efectiva al final del periodo pagado (${subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString('es-MX') : 'por definir'}). Hasta entonces, la cuenta seguirá activa.`}
        confirmLabel={isSubmitting ? 'Cancelando...' : 'Cancelar suscripción'}
        processing={isSubmitting}
        onCancel={() => setCancelOpen(false)}
        onConfirm={() => {
          void cancelSubscription().then((cancelled) => {
            if (cancelled) setCancelOpen(false);
          });
        }}
      />
    </PortalLayout>
  );
}

const styles = StyleSheet.create({
  billingClarity: {
    alignItems: 'center',
    backgroundColor: portalPalette.infoSoft,
    borderColor: 'rgba(35, 213, 255, 0.18)',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  billingClarityText: {
    color: portalPalette.text,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
    minWidth: 0,
  },
  subscriptionContent: {
    gap: 12,
  },
  cancelSubscriptionButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    borderColor: portalPalette.danger,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 14,
  },
  cancelSubscriptionText: {
    color: portalPalette.danger,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  currentPlanCard: {
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    gap: AppTheme.spacing.md,
    padding: AppTheme.spacing.lg,
  },
  currentPlanHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  currentPlanIdentity: {
    flex: 1,
    flexBasis: 280,
    gap: 4,
    minWidth: 0,
  },
  eyebrow: {
    color: portalPalette.accent,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  currentPlanName: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
  },
  currentPlanDescription: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
    maxWidth: 620,
  },
  currentMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  planFact: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flex: 1,
    flexBasis: 170,
    gap: 4,
    minHeight: 82,
    minWidth: 0,
    padding: 12,
  },
  planFactLabel: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
  },
  planFactValue: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 23,
  },
  usageBlock: {
    gap: 8,
  },
  usageHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  usageLabel: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  usageValue: {
    color: portalPalette.accent,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  usageTrack: {
    backgroundColor: portalPalette.surfaceSoft,
    borderRadius: AppTheme.radius.pill,
    height: 10,
    overflow: 'hidden',
  },
  usageFill: {
    backgroundColor: portalPalette.accent,
    borderRadius: AppTheme.radius.pill,
    height: 10,
  },
  usageHint: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  planGridWrapper: {
    marginHorizontal: -4,
    overflow: 'hidden',
  },
  planGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 12,
    minWidth: 0,
    overflow: 'auto',
    paddingBottom: 4,
    scrollBehavior: 'smooth' as any,
    WebkitOverflowScrolling: 'touch' as any,
  },
  planCard: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    flex: 1,
    flexBasis: 260,
    gap: 12,
    minWidth: 240,
    padding: AppTheme.spacing.md,
  },
  planCardSelected: {
    backgroundColor: portalPalette.accentSoft,
    borderColor: portalPalette.accent,
  },
  planCardActive: {
    borderColor: 'rgba(82, 242, 167, 0.45)',
  },
  planCardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  planCardTitleWrap: {
    flex: 1,
    flexBasis: 150,
    gap: 3,
    minWidth: 0,
  },
  planName: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 20,
    fontWeight: '900',
  },
  planDescription: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  priceRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  planPrice: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
  },
  pricePeriod: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
  },
  unitPrice: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  benefitList: {
    flex: 1,
    gap: 7,
  },
  benefitRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  benefitText: {
    color: portalPalette.text,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
    minWidth: 0,
  },
  compareButton: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.lineStrong,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  compareButtonText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  compareButtonTextSelected: {
    color: '#FFFFFF',
  },
  currentPlanAction: {
    alignItems: 'center',
    backgroundColor: portalPalette.successSoft,
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  currentPlanActionText: {
    color: portalPalette.success,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  planSkeleton: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    flex: 1,
    flexBasis: 260,
    gap: 13,
    minHeight: 230,
    minWidth: 240,
    padding: AppTheme.spacing.md,
  },
  comparisonFlow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  comparisonFlowCompact: {
    flexDirection: 'column',
  },
  comparisonPlan: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flex: 1,
    flexBasis: 250,
    gap: 5,
    minWidth: 0,
    padding: AppTheme.spacing.md,
  },
  comparisonPlanFeatured: {
    backgroundColor: portalPalette.accentSoft,
    borderColor: portalPalette.accent,
  },
  comparisonPlanCompact: {
    flexBasis: 'auto',
    width: '100%',
  },
  comparisonArrow: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: portalPalette.accentSoft,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  comparisonLabel: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  comparisonName: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 21,
    fontWeight: '900',
  },
  comparisonMeta: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  changeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  changeFact: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flex: 1,
    flexBasis: 210,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
    padding: 12,
  },
  changeFactIcon: {
    alignItems: 'center',
    backgroundColor: portalPalette.infoSoft,
    borderRadius: 10,
    flexShrink: 0,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  changeFactCopy: {
    flex: 1,
    minWidth: 0,
  },
  changeFactLabel: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 11,
  },
  changeFactValue: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  newBenefits: {
    backgroundColor: portalPalette.successSoft,
    borderColor: 'rgba(82, 242, 167, 0.22)',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    gap: 8,
    padding: AppTheme.spacing.md,
  },
  newBenefitsTitle: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  ruleNotice: {
    alignItems: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: AppTheme.spacing.md,
  },
  ruleNoticeAllowed: {
    backgroundColor: portalPalette.successSoft,
    borderColor: 'rgba(82, 242, 167, 0.24)',
  },
  ruleNoticeBlocked: {
    backgroundColor: portalPalette.warningSoft,
    borderColor: 'rgba(255, 209, 102, 0.28)',
  },
  ruleNoticeCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  ruleNoticeTitle: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  ruleNoticeText: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  restrictionText: {
    color: portalPalette.warning,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  nextStepText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 2,
  },
  actionFeedback: {
    alignItems: 'flex-start',
    backgroundColor: portalPalette.infoSoft,
    borderColor: 'rgba(35, 213, 255, 0.24)',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: AppTheme.spacing.md,
    padding: AppTheme.spacing.md,
  },
  plansErrorState: {
    alignItems: 'center',
    gap: 12,
  },
  retryButton: {
    alignItems: 'center',
    borderColor: portalPalette.lineStrong,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 18,
  },
  retryButtonText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  actionFeedbackText: {
    color: portalPalette.muted,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  previewActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-end',
  },
  previewActionsCompact: {
    flexDirection: 'column',
  },
  fullWidthButton: {
    width: '100%',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: portalPalette.lineStrong,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  continueButton: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 150,
    paddingHorizontal: 16,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.58,
  },
  comparisonEmpty: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.md,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: AppTheme.spacing.md,
  },
  comparisonEmptyIcon: {
    alignItems: 'center',
    backgroundColor: portalPalette.infoSoft,
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  comparisonEmptyCopy: {
    flex: 1,
    flexBasis: 240,
    gap: 3,
    minWidth: 0,
  },
  comparisonEmptyTitle: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  comparisonEmptyText: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
});
