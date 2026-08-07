import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router } from '@/src/navigation/router';
import { AppTheme, Typography } from '@/constants/theme';
import { formatCurrency, formatDate } from '@/src/utils/format';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { SkeletonBlock } from '@/src/components/ui/skeleton';
import { PortalSectionCard, formatPortalStatus, getPortalStatusTone } from '../cards';
import { PortalLayout } from '../components/portal-layout';
import { PortalButton } from '../components/portal-button';
import { ManualTransferEvidenceCard } from '../payments/manual-transfer-evidence-card';
import { portalButtonGradient, portalPalette } from '../portal-theme';
import { usePortalStore } from '../store/use-portal-store';

const PAYMENT_STEPS = [
  {
    icon: 'file-document-edit-outline' as const,
    title: '1. Genera tu orden',
    description: 'El importe y la referencia quedan vinculados a tu empresa y al plan elegido.',
  },
  {
    icon: 'bank-transfer' as const,
    title: '2. Realiza la transferencia',
    description: 'Usa exactamente la CLABE, el importe y la referencia mostrados durante el checkout.',
  },
  {
    icon: 'shield-check-outline' as const,
    title: '3. Envía la evidencia',
    description: 'Registra la clave de rastreo SPEI para que ManeComb pueda validar el depósito.',
  },
  {
    icon: 'check-decagram-outline' as const,
    title: '4. Espera la confirmación',
    description: 'El plan se activa únicamente después de la validación administrativa.',
  },
];

export function PortalPaymentsScreen() {
  const { error, isLoading, subscription } = usePortalStore(
    useShallow((state) => ({
      error: state.error,
      isLoading: state.isLoading,
      subscription: state.subscription,
    }))
  );

  const status = subscription?.status || '';
  const normalizedStatus = status.toLowerCase();
  const pendingStatuses = ['pending', 'pending_payment', 'payment_pending', 'pending_manual_confirmation'];
  const canRetry = ['failed', 'payment_failed', ...pendingStatuses].includes(normalizedStatus);
  const isPending = pendingStatuses.includes(normalizedStatus);
  const nextChargeDate = subscription?.currentPeriodEnd;
  const nextChargeAmount = subscription?.monthlyPrice;
  const [message, setMessage] = useState<string | null>(null);

  const retryPayment = () => {
    if (!subscription?.planId) {
      setMessage('No hay un plan disponible para generar una nueva orden.');
      return;
    }
    router.push({ pathname: '/ventas/pago', params: { planId: subscription.planId } } as never);
  };

  return (
    <PortalLayout title="Pagos" subtitle="Consulta el estado del cobro y continúa una transferencia pendiente sin mezclarla con tus facturas.">
      {isLoading && !subscription ? (
        <PortalSectionCard title="Estado del pago">
          <View style={{ gap: 10 }}>
            <SkeletonBlock height={24} width="40%" />
            <SkeletonBlock height={18} width="60%" />
            <SkeletonBlock height={80} />
          </View>
        </PortalSectionCard>
      ) : subscription?.id ? (
        <PortalSectionCard
          title="Estado del pago"
          subtitle={message || error || (isPending ? 'La orden sigue pendiente de validación.' : 'Información comercial actual de tu cuenta.')}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.headerRow}>
            <View style={styles.identity}>
              <Text style={styles.kicker}>Plan contratado</Text>
              <Text style={styles.planName}>{subscription.planName}</Text>
              <Text selectable style={styles.reference}>Referencia de cuenta: {subscription.id}</Text>
            </View>
            <StatusBadge label={formatPortalStatus(status)} tone={getPortalStatusTone(status)} />
          </View>

          {isPending ? (
            <View style={styles.pendingNotice}>
              <MaterialCommunityIcons name="clock-alert-outline" size={21} color={portalPalette.warning} />
              <View style={styles.pendingCopy}>
                <Text style={styles.pendingTitle}>Pago pendiente</Text>
                <Text style={styles.pendingText}>
                  Tu acceso se actualizará después de confirmar la transferencia. No generes otra orden salvo que la actual haya vencido o contenga datos incorrectos.
                </Text>
              </View>
            </View>
          ) : null}

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

          <View style={styles.actions}>
            {canRetry ? (
              <Pressable accessibilityRole="button" onPress={retryPayment} style={[styles.retryButton, portalButtonGradient()]}>
                <MaterialCommunityIcons name="bank-transfer" size={19} color="#FFFFFF" />
                <Text style={styles.retryText}>{isPending ? 'Revisar o regenerar transferencia' : 'Reintentar pago'}</Text>
              </Pressable>
            ) : null}
            <PortalButton onPress={() => router.push('/portal/facturacion' as never)} variant="secondary">
              Abrir facturación
            </PortalButton>
          </View>
        </PortalSectionCard>
      ) : (
        <PortalSectionCard title="Estado del pago">
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="receipt-text-outline" size={28} color={portalPalette.muted} />
            <Text style={styles.emptyTitle}>No existe una orden comercial</Text>
            <Text style={styles.emptyText}>Selecciona un plan para iniciar una contratación.</Text>
            <PortalButton onPress={() => router.push('/portal/plan' as never)} variant="secondary">Ver planes</PortalButton>
          </View>
        </PortalSectionCard>
      )}

      {subscription?.id ? <ManualTransferEvidenceCard orderId={subscription.id} /> : null}

      <PortalSectionCard title="Cómo se confirma una transferencia" subtitle="El estado del plan siempre proviene del backend; una captura o referencia por sí sola no activa el servicio.">
        <View style={styles.stepGrid}>
          {PAYMENT_STEPS.map((step) => (
            <View key={step.title} style={styles.stepCard}>
              <View style={styles.stepIcon}>
                <MaterialCommunityIcons name={step.icon} size={21} color={portalPalette.info} />
              </View>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepText}>{step.description}</Text>
            </View>
          ))}
        </View>
      </PortalSectionCard>
    </PortalLayout>
  );
}

const styles = StyleSheet.create({
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  identity: { flex: 1, gap: 4, minWidth: 220 },
  kicker: { color: portalPalette.accent, fontFamily: Typography.body, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  planName: { color: portalPalette.text, fontFamily: Typography.display, fontSize: 26, fontWeight: '900' },
  reference: { color: portalPalette.mutedSoft, fontFamily: Typography.mono, fontSize: 11, marginTop: 2 },
  pendingNotice: { alignItems: 'flex-start', backgroundColor: portalPalette.warningSoft, borderColor: portalPalette.warning, borderRadius: AppTheme.radius.sm, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 12 },
  pendingCopy: { flex: 1, gap: 3, minWidth: 0 },
  pendingTitle: { color: portalPalette.text, fontFamily: Typography.body, fontSize: 13, fontWeight: '900' },
  pendingText: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 12, lineHeight: 18 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fact: { backgroundColor: portalPalette.surfaceSoft, borderColor: portalPalette.line, borderRadius: AppTheme.radius.sm, borderWidth: 1, flex: 1, flexBasis: 180, gap: 4, padding: 12 },
  factLabel: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 11 },
  factValue: { color: portalPalette.text, fontFamily: Typography.body, fontSize: 14, fontWeight: '900' },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  retryButton: { alignItems: 'center', borderRadius: AppTheme.radius.sm, flexDirection: 'row', gap: 8, minHeight: 44, paddingHorizontal: 16 },
  retryText: { color: '#FFFFFF', fontFamily: Typography.body, fontSize: 13, fontWeight: '900' },
  emptyState: { alignItems: 'center', gap: 8, padding: AppTheme.spacing.lg },
  emptyTitle: { color: portalPalette.text, fontFamily: Typography.display, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 13, textAlign: 'center' },
  errorText: { color: portalPalette.danger, fontFamily: Typography.body, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  stepGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stepCard: { backgroundColor: portalPalette.surfaceSoft, borderColor: portalPalette.line, borderRadius: AppTheme.radius.sm, borderWidth: 1, flex: 1, flexBasis: 220, gap: 7, minWidth: 0, padding: 14 },
  stepIcon: { alignItems: 'center', backgroundColor: portalPalette.infoSoft, borderRadius: AppTheme.radius.sm, height: 38, justifyContent: 'center', width: 38 },
  stepTitle: { color: portalPalette.text, fontFamily: Typography.display, fontSize: 14, fontWeight: '900' },
  stepText: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 12, lineHeight: 18 },
});
