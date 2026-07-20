import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { AppTheme, Typography } from '@/constants/theme';
import { formatCurrency, formatDate } from '@/src/utils/format';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { SkeletonBlock } from '@/src/components/ui/skeleton';
import { resolveInvoiceDownloadUrl } from '@/features/commercial';
import { InvoiceList, PortalSectionCard, formatPortalStatus, getPortalStatusTone } from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { PortalButton } from '../components/portal-button';
import { portalButtonGradient, portalPalette } from '../portal-theme';
import { usePortalStore } from '../store/use-portal-store';

export function PortalPaymentsScreen() {
  const { error, invoices, isLoading, subscription } = usePortalStore(
    useShallow((state) => ({
      error: state.error,
      invoices: state.invoices,
      isLoading: state.isLoading,
      subscription: state.subscription,
    }))
  );

  const status = subscription?.status || '';
  const canRetry = ['failed', 'payment_failed', 'pending', 'pending_payment', 'payment_pending'].includes(status.toLowerCase());
  const nextChargeDate = subscription?.currentPeriodEnd;
  const nextChargeAmount = subscription?.monthlyPrice;

  const retryPayment = () => {
    if (!subscription?.planId) {
      setMessage('No hay un plan activo para renovar.');
      return;
    }
    router.push({ pathname: '/ventas/pago', params: { planId: subscription.planId } } as never);
  };

  const [message, setMessage] = useState<string | null>(null);

  return (
    <PortalLayout title="Administración comercial" subtitle="Estado del plan, pagos, facturas y referencias de tu cuenta.">
      {isLoading && !subscription ? (
        <PortalSectionCard title="Estado comercial">
          <View style={{ gap: 10 }}>
            <SkeletonBlock height={24} width="40%" />
            <SkeletonBlock height={18} width="60%" />
            <SkeletonBlock height={80} />
          </View>
        </PortalSectionCard>
      ) : subscription?.id ? (
        <PortalSectionCard title="Estado del plan" subtitle={message || error || 'Información actual de tu suscripción.'}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.headerRow}>
            <View style={styles.identity}>
              <Text style={styles.kicker}>Plan contratado</Text>
              <Text style={styles.planName}>{subscription.planName}</Text>
              <Text style={styles.reference}>Ref: {subscription.id}</Text>
            </View>
            <StatusBadge label={formatPortalStatus(status)} tone={getPortalStatusTone(status)} />
          </View>
          <View style={styles.facts}>
            <View style={styles.fact}>
              <Text style={styles.factLabel}>Importe mensual</Text>
              <Text style={styles.factValue}>{formatCurrency(nextChargeAmount || 0, subscription.currency || 'MXN')}</Text>
            </View>
            <View style={styles.fact}>
              <Text style={styles.factLabel}>Inicio del periodo</Text>
              <Text style={styles.factValue}>{formatDate(subscription.currentPeriodStart, { fallback: 'Sin registro' })}</Text>
            </View>
            <View style={styles.fact}>
              <Text style={styles.factLabel}>Próximo cobro</Text>
              <Text style={styles.factValue}>{nextChargeDate ? formatDate(nextChargeDate, { fallback: 'Sin fecha' }) : 'Sin fecha'}</Text>
            </View>
            <View style={styles.fact}>
              <Text style={styles.factLabel}>Capacidad disponible</Text>
              <Text style={styles.factValue}>{subscription.availableUnits} de {subscription.totalUnits} unidades</Text>
            </View>
            {subscription.cancelAt ? (
              <View style={styles.fact}>
                <Text style={styles.factLabel}>Cancelación efectiva</Text>
                <Text style={styles.factValue}>{formatDate(subscription.cancelAt, { fallback: 'Sin fecha' })}</Text>
              </View>
            ) : null}
          </View>
          {canRetry ? (
            <Pressable accessibilityRole="button" onPress={retryPayment} style={[styles.retryButton, portalButtonGradient()]}>
              <MaterialCommunityIcons name="credit-card-refresh-outline" size={19} color="#FFFFFF" />
              <Text style={styles.retryText}>Reintentar pago</Text>
            </Pressable>
          ) : null}
        </PortalSectionCard>
      ) : (
        <PortalSectionCard title="Estado comercial">
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="receipt-text-outline" size={28} color={portalPalette.muted} />
            <Text style={styles.emptyTitle}>No existe una orden comercial</Text>
            <Text style={styles.emptyText}>Selecciona un plan para iniciar una contratación.</Text>
            <PortalButton onPress={() => router.push('/portal/plan' as never)} variant="secondary">Ver planes</PortalButton>
          </View>
        </PortalSectionCard>
      )}

      {subscription?.id ? (
        <PortalSectionCard title="Facturas" subtitle="Comprobantes asociados a tu cuenta.">
          {invoices.length ? (
            <InvoiceList invoices={invoices} onDownload={(invoice) => { Linking.openURL(resolveInvoiceDownloadUrl(invoice)).catch(() => {}); }} />
          ) : (
            <View style={styles.emptyInline}>
              <Text style={styles.emptyInlineText}>No hay facturas disponibles. Aparecerán después del primer cobro.</Text>
            </View>
          )}
        </PortalSectionCard>
      ) : null}
    </PortalLayout>
  );
}

const styles = StyleSheet.create({
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  identity: { flex: 1, gap: 4, minWidth: 220 },
  kicker: { color: portalPalette.accent, fontFamily: Typography.body, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  planName: { color: portalPalette.text, fontFamily: Typography.display, fontSize: 26, fontWeight: '900' },
  reference: { color: portalPalette.mutedSoft, fontFamily: Typography.mono, fontSize: 11, marginTop: 2 },
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
  emptyInline: { padding: AppTheme.spacing.md },
  emptyInlineText: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 13, lineHeight: 19 },
  errorText: { color: portalPalette.danger, fontFamily: Typography.body, fontSize: 12, lineHeight: 18, marginBottom: 8 },
});
