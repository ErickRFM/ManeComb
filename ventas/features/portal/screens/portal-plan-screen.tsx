import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { getCommercialPlansRequest } from '@/src/api/client';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge } from '@/src/components/ui/status-badge';
import {
  PlanStatusCard,
  PortalSectionCard,
  UsageUnitsCard,
  formatPortalStatus,
  getPortalStatusTone,
} from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { usePortalStore } from '../store/use-portal-store';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { CommercialPlan } from '@/src/types/app';

export function PortalPlanScreen() {
  const { theme } = useAppTheme();
  const { cancelPlan, changePlan, isSubmitting, loadOverview, subscription } = usePortalStore(
    useShallow((state) => ({
      cancelPlan: state.cancelPlan,
      changePlan: state.changePlan,
      isSubmitting: state.isSubmitting,
      loadOverview: state.loadOverview,
      subscription: state.subscription,
    }))
  );
  const [plans, setPlans] = useState<CommercialPlan[]>([]);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    void loadOverview();
    void getCommercialPlansRequest().then(setPlans).catch(() => setPlans([]));
  }, [loadOverview]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === pendingPlanId) || null,
    [pendingPlanId, plans]
  );

  return (
    <PortalLayout title="Gestion de plan" subtitle="Cambia, cancela y revisa la capacidad contratada.">
      <View style={styles.grid}>
        <PlanStatusCard subscription={subscription} />
        <UsageUnitsCard subscription={subscription} />
      </View>

      <PortalSectionCard
        title="Cambiar plan"
        subtitle="El cambio actualiza unidades disponibles y el resumen comercial.">
        {plans.length ? (
          <View style={styles.planGrid}>
            {plans.map((plan) => {
              const active = plan.id === subscription?.planId;

              return (
                <Pressable
                  key={plan.id}
                  disabled={active || isSubmitting}
                  onPress={() => setPendingPlanId(plan.id)}
                  style={[
                    styles.planCard,
                    {
                      backgroundColor: active ? theme.colors.accentSoft : theme.colors.surface,
                      borderColor: active ? theme.colors.accent : theme.colors.line,
                    },
                    isSubmitting && !active ? styles.disabledButton : undefined,
                  ]}>
                  <View style={styles.planHeader}>
                    <Text style={[styles.planName, { color: theme.colors.text }]}>{plan.name}</Text>
                    <StatusBadge label={active ? 'actual' : plan.badge} tone={active ? 'positive' : 'info'} />
                  </View>
                  <Text style={[styles.planPrice, { color: theme.colors.text }]}>${plan.price} MXN</Text>
                  <Text style={[styles.planDetail, { color: theme.colors.muted }]}>
                    {plan.units} combis / ${plan.pricePerVehicle} por unidad
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <EmptyState icon="clipboard-list-outline" title="Planes no disponibles" />
        )}
      </PortalSectionCard>

      <PortalSectionCard
        title="Estado de suscripcion"
        right={<StatusBadge label={formatPortalStatus(subscription?.status || 'inactive')} tone={getPortalStatusTone(subscription?.status)} />}>
        <View style={styles.dangerRow}>
          <View style={styles.dangerCopy}>
            <Text style={[styles.dangerTitle, { color: theme.colors.text }]}>Cancelar plan</Text>
            <Text style={[styles.dangerText, { color: theme.colors.muted }]}>
              Requiere confirmacion y queda registrado en auditoria.
            </Text>
          </View>
          <Pressable
            onPress={() => setConfirmCancel(true)}
            disabled={isSubmitting || !subscription?.id}
            style={[
              styles.cancelButton,
              { backgroundColor: theme.colors.dangerSoft },
              isSubmitting || !subscription?.id ? styles.disabledButton : undefined,
            ]}>
            <MaterialCommunityIcons name="close-circle-outline" size={18} color={theme.colors.danger} />
            <Text style={[styles.cancelText, { color: theme.colors.danger }]}>Cancelar</Text>
          </Pressable>
        </View>
      </PortalSectionCard>

      <ConfirmModal
        visible={Boolean(selectedPlan)}
        title="Cambiar plan"
        description={`Se cambiara la suscripcion a ${selectedPlan?.name || 'este plan'}.`}
        confirmLabel="Cambiar"
        onCancel={() => setPendingPlanId(null)}
        onConfirm={() => {
          const planId = pendingPlanId;
          setPendingPlanId(null);
          if (planId) {
            void changePlan(planId);
          }
        }}
      />
      <ConfirmModal
        visible={confirmCancel}
        danger
        title="Cancelar plan"
        description="La suscripcion quedara cancelada y se notificara al dashboard en tiempo real."
        confirmLabel="Cancelar plan"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          void cancelPlan('Cancelado desde portal web');
        }}
      />
    </PortalLayout>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppTheme.spacing.md,
    minWidth: 0,
  },
  planGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    minWidth: 0,
  },
  planCard: {
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flex: 1,
    flexBasis: 240,
    gap: 8,
    minHeight: 136,
    minWidth: 0,
    padding: AppTheme.spacing.md,
  },
  planHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  planName: {
    flex: 1,
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 15,
    fontWeight: '900',
    minWidth: 0,
  },
  planPrice: {
    fontFamily: Typography.display,
    fontSize: 26,
    fontWeight: '900',
    minWidth: 0,
  },
  planDetail: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 19,
    minWidth: 0,
  },
  dangerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'space-between',
  },
  dangerCopy: {
    flex: 1,
    flexBasis: 260,
    minWidth: 0,
  },
  dangerTitle: {
    fontFamily: Typography.body,
    fontSize: 15,
    fontWeight: '900',
  },
  dangerText: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 19,
  },
  cancelButton: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.sm,
    flexShrink: 0,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 14,
  },
  cancelText: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.55,
  },
});
