import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { SkeletonBlock } from '@/src/components/ui/skeleton';
import {
  AccountSummaryCard,
  ActivationTimeline,
  PortalSectionCard,
} from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { portalButtonGradient, portalPalette } from '../portal-theme';
import { usePortalStore } from '../store/use-portal-store';
import type { PortalInvoice, PortalSubscription } from '@/src/types/app';
import { useAppStore } from '@/src/store/use-app-store';
import { canOpenOperationalPanel } from '../utils/access';

function formatDate(value?: string | null) {
  if (!value) {
    return 'Pendiente';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Pendiente'
    : date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function getPlanLabel(subscription?: PortalSubscription | null) {
  const status = String(subscription?.status || '').toLowerCase();

  if (['active', 'trial', 'trial_active'].includes(status)) {
    return 'Plan activo';
  }

  if (['pending', 'pending_payment'].includes(status)) {
    return 'Cuenta pendiente';
  }

  if (['cancelled', 'canceled', 'suspended'].includes(status)) {
    return 'Cuenta pendiente';
  }

  return 'Sin plan';
}

function getPaymentLabel(subscription?: PortalSubscription | null) {
  const status = String(subscription?.status || '').toLowerCase();

  if (['active', 'trial', 'trial_active'].includes(status)) {
    return 'Pago al dia';
  }

  if (['pending', 'pending_payment'].includes(status)) {
    return 'Cuenta pendiente';
  }

  return 'Por revisar';
}

function getLatestInvoice(invoices: PortalInvoice[]) {
  return [...invoices].sort((a, b) => {
    const aTime = new Date(a.issuedAt || '').getTime() || 0;
    const bTime = new Date(b.issuedAt || '').getTime() || 0;
    return bTime - aTime;
  })[0];
}

function isPendingInvoice(invoice: PortalInvoice) {
  return !['paid', 'ready', 'completed'].includes(String(invoice.status || '').toLowerCase());
}

function getActivationCopy(status: string) {
  return status === 'completed' ? 'Activacion lista' : 'Activacion pendiente';
}

export function PortalDashboardScreen() {
  const user = useAppStore((state) => state.user);
  const { invoices, isLoading, loadAll, onboarding, overview, subscription } = usePortalStore(
    useShallow((state) => ({
      invoices: state.invoices,
      isLoading: state.isLoading,
      loadAll: state.loadAll,
      onboarding: state.onboarding,
      overview: state.overview,
      subscription: state.subscription,
    }))
  );

  const currentSubscription = subscription || overview?.subscription || null;
  const showOperationalPanel = canOpenOperationalPanel(currentSubscription, user);
  const latestInvoice = useMemo(() => getLatestInvoice(invoices), [invoices]);
  const pendingInvoices = useMemo(() => invoices.filter(isPendingInvoice), [invoices]);
  const activationStatus = onboarding?.status || overview?.onboarding.status || 'pending';
  const completedSteps = onboarding?.steps.filter((step) => step.status === 'completed').length ||
    overview?.activationTimeline.filter((event) => event.status === 'completed').length ||
    0;
  const totalSteps = onboarding?.steps.length || overview?.activationTimeline.length || 0;
  const priorityItems = useMemo(() => {
    const items: string[] = [];
    const subscriptionStatus = String(currentSubscription?.status || '').toLowerCase();

    if (['pending', 'pending_payment', 'inactive'].includes(subscriptionStatus)) {
      items.push('Hay pasos comerciales pendientes para activar la cuenta.');
    }

    if (pendingInvoices.length) {
      items.push(`${pendingInvoices.length} factura${pendingInvoices.length === 1 ? '' : 's'} requiere${pendingInvoices.length === 1 ? '' : 'n'} seguimiento.`);
    }

    if (activationStatus !== 'completed') {
      items.push('La activacion empresarial aun no esta completa.');
    }

    return items.slice(0, 2);
  }, [activationStatus, currentSubscription?.status, pendingInvoices.length]);
  const quickActions = [
    {
      label: 'Gestionar plan',
      icon: 'clipboard-list-outline' as const,
      onPress: () => router.push('/portal/plan' as never),
    },
    {
      label: 'Ver facturas',
      icon: 'file-document-outline' as const,
      onPress: () => router.push('/portal/facturacion' as never),
    },
    {
      label: 'Metodo de pago',
      icon: 'credit-card-outline' as const,
      onPress: () => router.push('/portal/pagos' as never),
    },
    {
      label: 'Activacion',
      icon: 'flag-checkered' as const,
      onPress: () => router.push('/portal/onboarding' as never),
    },
    ...(showOperationalPanel ? [{
      label: 'Panel operativo',
      icon: 'map-marker-radius-outline' as const,
      onPress: () => router.push('/mapa' as never),
    }] : []),
  ];

  return (
    <PortalLayout
      title="Inicio"
      subtitle="Resumen de cuenta, suscripcion y activacion empresarial."
      actions={
        <Pressable
          onPress={() => void loadAll()}
          style={[styles.actionButton, portalButtonGradient()]}>
          <MaterialCommunityIcons name="refresh" size={18} color="#FFFFFF" />
          <Text style={styles.actionText}>Actualizar</Text>
        </Pressable>
      }>
      {isLoading && !overview ? (
        <View style={styles.grid}>
          {[0, 1, 2, 3].map((item) => (
            <View key={item} style={styles.skeletonCard}>
              <SkeletonBlock height={18} width="45%" />
              <SkeletonBlock height={36} />
              <SkeletonBlock height={16} width="70%" />
            </View>
          ))}
        </View>
      ) : null}

      {overview ? (
        <>
          {priorityItems.length ? (
            <View style={styles.priorityNotice}>
              <View style={styles.priorityIcon}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={portalPalette.warning} />
              </View>
              <View style={styles.priorityCopy}>
                <Text style={styles.priorityTitle}>Atencion requerida</Text>
                <Text style={styles.priorityText}>{priorityItems.join(' ')}</Text>
              </View>
              <Pressable onPress={() => router.push('/portal/onboarding' as never)} style={styles.priorityButton}>
                <Text style={styles.priorityButtonText}>Revisar</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.summaryGrid}>
            <AccountSummaryCard
              icon="clipboard-check-outline"
              label={getPlanLabel(currentSubscription)}
              value={currentSubscription?.planName || 'Sin plan'}
              detail="Plan actual"
              tone={getPlanLabel(currentSubscription) === 'Plan activo' ? 'positive' : 'warning'}
            />
            <AccountSummaryCard
              icon="account-group-outline"
              label="Usuarios utilizados"
              value={String(overview.metrics.activeUsers)}
              detail={`${overview.metrics.pendingUsers} pendientes`}
              tone="info"
            />
            <AccountSummaryCard
              icon="credit-card-check-outline"
              label={pendingInvoices.length ? 'Facturacion pendiente' : getPaymentLabel(currentSubscription)}
              value={pendingInvoices.length ? String(pendingInvoices.length) : formatDate(currentSubscription?.currentPeriodEnd)}
              detail={pendingInvoices.length ? 'Documentos por revisar' : 'Proximo pago'}
              tone={pendingInvoices.length ? 'warning' : getPaymentLabel(currentSubscription) === 'Pago al dia' ? 'positive' : 'warning'}
            />
            <AccountSummaryCard
              icon="flag-checkered"
              label={activationStatus === 'completed' ? 'Plan activo' : 'Cuenta pendiente'}
              value={getActivationCopy(activationStatus)}
              detail={`${completedSteps}/${totalSteps} pasos`}
              tone={activationStatus === 'completed' ? 'positive' : 'warning'}
            />
          </View>

          <View style={styles.contentColumns}>
            <PortalSectionCard
              title="Actividad reciente"
              subtitle={latestInvoice ? `Ultima factura: ${latestInvoice.id}` : 'Sin facturas recientes'}>
              <ActivationTimeline events={overview.activationTimeline.slice(0, 4)} />
            </PortalSectionCard>

            <PortalSectionCard title="Accesos rapidos" subtitle="Tareas de cuenta frecuentes.">
              <View style={styles.quickGrid}>
                {quickActions.map((item) => (
                  <Pressable key={item.label} onPress={item.onPress} style={styles.quickAction}>
                    <View style={styles.quickIcon}>
                      <MaterialCommunityIcons name={item.icon} size={20} color={portalPalette.accent} />
                    </View>
                    <Text style={styles.quickText}>{item.label}</Text>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={portalPalette.muted} />
                  </Pressable>
                ))}
              </View>
            </PortalSectionCard>
          </View>
        </>
      ) : !isLoading ? (
        <EmptyState
          icon="view-dashboard-outline"
          title="Portal sin datos"
          description="El resumen aparecera cuando exista un plan activo."
        />
      ) : null}
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
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppTheme.spacing.md,
    minWidth: 0,
  },
  contentColumns: {
    flexDirection: 'column',
    gap: AppTheme.spacing.md,
    minWidth: 0,
    width: '100%',
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 14,
  },
  actionText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  skeletonCard: {
    backgroundColor: portalPalette.surface,
    borderColor: portalPalette.line,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexBasis: 230,
    gap: 12,
    minWidth: 0,
    minHeight: 136,
    padding: AppTheme.spacing.md,
  },
  priorityNotice: {
    alignItems: 'flex-start',
    backgroundColor: portalPalette.warningSoft,
    borderColor: 'rgba(255, 209, 102, 0.24)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: AppTheme.spacing.md,
  },
  priorityIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 209, 102, 0.12)',
    borderRadius: 10,
    flexShrink: 0,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  priorityCopy: {
    flex: 1,
    flexBasis: 260,
    gap: 3,
    minWidth: 0,
  },
  priorityTitle: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  priorityText: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 19,
  },
  priorityButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 209, 102, 0.28)',
    borderRadius: 10,
    borderWidth: 1,
    flexShrink: 0,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  priorityButtonText: {
    color: portalPalette.warning,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    minWidth: 0,
  },
  quickAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
    borderColor: portalPalette.line,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    flexBasis: 190,
    flexGrow: 1,
    gap: 10,
    minHeight: 52,
    minWidth: 0,
    paddingHorizontal: 12,
  },
  quickIcon: {
    alignItems: 'center',
    backgroundColor: portalPalette.accentSoft,
    borderRadius: 10,
    flexShrink: 0,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  quickText: {
    color: portalPalette.text,
    flex: 1,
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
    minWidth: 0,
  },
});
