import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { EmptyState } from '@/src/components/ui/empty-state';
import { SkeletonBlock } from '@/src/components/ui/skeleton';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { router } from '@/src/navigation/router';
import {
  CommercialActivityList,
  useCommercialExperience,
} from '@/features/commercial';
import { PortalSectionCard } from '../cards';
import { PortalLayout } from '../components/portal-layout';
import { portalPalette } from '../portal-theme';
import { styles } from '../plan/plan.styles';
import { PlanCurrentSummary } from '../plan/components/plan-current-summary';
import { PlanComparisonCard } from '../plan/components/plan-comparison-card';
import { PlanChangePreview } from '../plan/components/plan-change-preview';

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
            <PlanCurrentSummary currentPlan={currentPlan} state={workspace.state} subscription={subscription} canCancel={canCancel} onCancel={() => setCancelOpen(true)} />
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
                <PlanComparisonCard
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
        <PlanChangePreview
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


