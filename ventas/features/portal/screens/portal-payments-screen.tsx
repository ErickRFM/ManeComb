import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { AppTheme, Typography } from '@/constants/theme';
import { formatCurrency, formatDate } from '@/src/utils/format';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { PortalSectionCard, formatPortalStatus, getPortalStatusTone } from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { portalButtonGradient, portalPalette } from '../portal-theme';
import { usePortalStore } from '../store/use-portal-store';

export function PortalPaymentsScreen() {
  const subscription = usePortalStore((state) => state.subscription);
  const loadOverview = usePortalStore((state) => state.loadOverview);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const canRetry = Boolean(
    subscription?.planId &&
    ['failed', 'payment_failed', 'pending', 'pending_payment', 'payment_pending'].includes(
      String(subscription.status || '').toLowerCase()
    )
  );

  const retryPayment = () => {
    if (!subscription?.planId) return;
    router.push({ pathname: '/ventas/pago', params: { planId: subscription.planId } } as never);
  };

  return (
    <PortalLayout title="Pagos" subtitle="Consulta el estado real informado por tu orden y suscripción.">
      <PortalSectionCard title="Estado comercial" subtitle="Estos datos provienen del backend de ManeComb.">
        {subscription?.id ? (
          <View style={styles.paymentCard}>
            <View style={styles.headerRow}>
              <View style={styles.identity}>
                <Text style={styles.kicker}>Plan contratado</Text>
                <Text style={styles.planName}>{subscription.planName}</Text>
              </View>
              <StatusBadge
                label={formatPortalStatus(subscription.status)}
                tone={getPortalStatusTone(subscription.status)}
              />
            </View>
            <View style={styles.facts}>
              <View style={styles.fact}>
                <Text style={styles.factLabel}>Importe mensual</Text>
                <Text style={styles.factValue}>{formatCurrency(subscription.monthlyPrice || 0, subscription.currency || 'MXN')}</Text>
              </View>
              <View style={styles.fact}>
                <Text style={styles.factLabel}>Inicio del periodo</Text>
                <Text style={styles.factValue}>{formatDate(subscription.currentPeriodStart, { fallback: 'Sin fecha registrada' })}</Text>
              </View>
              <View style={styles.fact}>
                <Text style={styles.factLabel}>Fin del periodo</Text>
                <Text style={styles.factValue}>{formatDate(subscription.currentPeriodEnd, { fallback: 'Sin fecha registrada' })}</Text>
              </View>
            </View>
            {canRetry ? (
              <Pressable accessibilityRole="button" onPress={retryPayment} style={[styles.retryButton, portalButtonGradient()]}>
                <MaterialCommunityIcons name="credit-card-refresh-outline" size={19} color="#FFFFFF" />
                <Text style={styles.retryText}>Reintentar pago</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="receipt-text-outline" size={28} color={portalPalette.muted} />
            <Text style={styles.emptyTitle}>No existe una orden comercial</Text>
            <Text style={styles.emptyText}>Selecciona un plan para iniciar una contratación.</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/portal/plan' as never)} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Ver planes</Text>
            </Pressable>
          </View>
        )}
      </PortalSectionCard>
    </PortalLayout>
  );
}

const styles = StyleSheet.create({
  paymentCard: { gap: AppTheme.spacing.md },
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  identity: { flex: 1, gap: 4, minWidth: 220 },
  kicker: { color: portalPalette.accent, fontFamily: Typography.body, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  planName: { color: portalPalette.text, fontFamily: Typography.display, fontSize: 26, fontWeight: '900' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fact: { backgroundColor: portalPalette.surfaceSoft, borderColor: portalPalette.line, borderRadius: AppTheme.radius.sm, borderWidth: 1, flex: 1, flexBasis: 180, gap: 4, padding: 12 },
  factLabel: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 11 },
  factValue: { color: portalPalette.text, fontFamily: Typography.body, fontSize: 14, fontWeight: '900' },
  retryButton: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: AppTheme.radius.sm, flexDirection: 'row', gap: 8, minHeight: 44, paddingHorizontal: 16 },
  retryText: { color: '#FFFFFF', fontFamily: Typography.body, fontSize: 13, fontWeight: '900' },
  emptyState: { alignItems: 'center', gap: 8, padding: AppTheme.spacing.lg },
  emptyTitle: { color: portalPalette.text, fontFamily: Typography.display, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 13, textAlign: 'center' },
  secondaryButton: { borderColor: portalPalette.lineStrong, borderRadius: AppTheme.radius.sm, borderWidth: 1, marginTop: 6, paddingHorizontal: 16, paddingVertical: 10 },
  secondaryText: { color: portalPalette.text, fontFamily: Typography.body, fontSize: 13, fontWeight: '900' },
});
