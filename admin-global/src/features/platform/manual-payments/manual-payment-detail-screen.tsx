import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from '@/components/router';
import { useAdminStore } from '@/features/auth/store';
import { palette, Typography } from '@/styles/theme';
import { AdminShell } from '../components/admin-shell';
import { usePlatformOperationsStore } from '../operations/store';
import {
  platformManualPaymentDecisionRequest,
  platformManualPaymentRequest,
  type PlatformManualPaymentEvidence,
  type PlatformManualPaymentPayload,
} from './api';

const MANUAL_PAYMENT_ROLES = new Set(['platform_owner', 'platform_admin', 'platform_finance']);

function formatDate(value: string | null | undefined) {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Sin registro'
    : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatMoney(value: number, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(value || 0);
}

function createIdempotencyKey() {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  return `admin-manual-${Date.now()}-${Math.random().toString(36).slice(2, 18)}`;
}

function evidenceTone(status: string) {
  if (status === 'approved') return { borderColor: palette.success, color: palette.success };
  if (status === 'rejected') return { borderColor: palette.danger, color: palette.danger };
  if (status === 'reviewing') return { borderColor: palette.info, color: palette.info };
  return { borderColor: palette.warning, color: palette.warning };
}

function EvidencePanel({ evidence }: { evidence: PlatformManualPaymentEvidence }) {
  const tone = evidenceTone(evidence.status);
  return (
    <View style={[styles.evidenceCard, { borderColor: tone.borderColor }]}>
      <View style={styles.headerRow}>
        <View style={styles.flex}>
          <Text style={styles.sectionTitle}>Evidencia SPEI</Text>
          <Text selectable style={styles.trackingKey}>{evidence.trackingKey}</Text>
        </View>
        <Text style={[styles.badge, { color: tone.color }]}>{evidence.status}</Text>
      </View>
      <View style={styles.factGrid}>
        <Fact label="Importe reportado" value={formatMoney(evidence.amount, evidence.currency)} />
        <Fact label="Banco de origen" value={evidence.originBank || 'No informado'} />
        <Fact label="Fecha transferencia" value={formatDate(evidence.transferDate)} />
        <Fact label="Recibida" value={formatDate(evidence.submittedAt)} />
        <Fact label="Versión" value={String(evidence.version)} />
      </View>
      {evidence.note ? <View style={styles.noteBox}><Text style={styles.factLabel}>Nota del cliente</Text><Text style={styles.bodyText}>{evidence.note}</Text></View> : null}
      {evidence.reviewNote ? <View style={styles.noteBox}><Text style={styles.factLabel}>Nota de revisión</Text><Text style={styles.bodyText}>{evidence.reviewNote}</Text></View> : null}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text selectable style={styles.factValue}>{value}</Text>
    </View>
  );
}

export function AdminCommercialDetailScreen({ orderId }: { orderId: string }) {
  const token = useAdminStore((state) => state.session?.token || '');
  const role = useAdminStore((state) => state.session?.user.role || '');
  const orderState = usePlatformOperationsStore((store) => store.commercialState);
  const orderError = usePlatformOperationsStore((store) => store.commercialError);
  const order = usePlatformOperationsStore((store) => store.selectedOrder);
  const loadOrder = usePlatformOperationsStore((store) => store.loadOrder);

  const [manualData, setManualData] = useState<PlatformManualPaymentPayload | null>(null);
  const [manualLoading, setManualLoading] = useState(true);
  const [manualError, setManualError] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [trackingConfirmation, setTrackingConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const decisionKeyRef = useRef<string | null>(null);

  const loadManual = useCallback(async () => {
    if (!token || !orderId) return;
    setManualLoading(true);
    setManualError(null);
    try {
      setManualData(await platformManualPaymentRequest(token, orderId));
    } catch (error) {
      setManualError(error instanceof Error ? error.message : 'No fue posible consultar la transferencia.');
    } finally {
      setManualLoading(false);
    }
  }, [orderId, token]);

  useEffect(() => {
    if (!token) return;
    void loadOrder(token, orderId);
    void loadManual();
  }, [loadManual, loadOrder, orderId, token]);

  const evidence = manualData?.evidence || null;
  const canManage = MANUAL_PAYMENT_ROLES.has(role);
  const canReview = canManage && evidence && ['pending_review'].includes(evidence.status);
  const exactTrackingMatch = Boolean(
    evidence && trackingConfirmation.trim().toUpperCase() === evidence.trackingKey.trim().toUpperCase()
  );
  const canSubmitDecision = Boolean(
    decision &&
    evidence &&
    !submitting &&
    (decision === 'approve' ? exactTrackingMatch : reviewNote.trim().length >= 4)
  );

  const resetDecisionKey = () => {
    decisionKeyRef.current = null;
  };

  const submitDecision = async () => {
    if (!token || !decision || !evidence || !canSubmitDecision) return;
    setSubmitting(true);
    setManualError(null);
    try {
      const key = decisionKeyRef.current || createIdempotencyKey();
      decisionKeyRef.current = key;
      const result = await platformManualPaymentDecisionRequest(
        token,
        orderId,
        {
          decision,
          evidenceVersion: evidence.version,
          note: reviewNote,
          trackingKeyConfirmation: decision === 'approve' ? trackingConfirmation.trim() : undefined,
        },
        key
      );
      setManualData(result);
      setDecision(null);
      setReviewNote('');
      setTrackingConfirmation('');
      decisionKeyRef.current = null;
      await loadOrder(token, orderId);
    } catch (error) {
      setManualError(error instanceof Error ? error.message : 'No fue posible revisar la transferencia.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminShell
      actions={<Pressable onPress={() => router.push('/admin/commercial')} style={styles.secondaryButton}><Text style={styles.secondaryText}>Volver</Text></Pressable>}
      title={order?.companyName || manualData?.order.companyName || 'Orden comercial'}
      subtitle="Detalle comercial y validación controlada de transferencias SPEI. La aprobación exige MFA, permiso financiero, versión vigente e idempotencia.">
      {orderState === 'loading' || orderState === 'idle' ? (
        <View style={styles.stateCard}><ActivityIndicator color={palette.info} /><Text style={styles.bodyText}>Cargando orden…</Text></View>
      ) : null}
      {orderState === 'error' ? (
        <View style={[styles.stateCard, styles.errorCard]}>
          <Text style={styles.errorText}>{orderError || 'No fue posible cargar la orden.'}</Text>
          <Pressable onPress={() => token && void loadOrder(token, orderId)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Reintentar</Text></Pressable>
        </View>
      ) : null}

      {order ? (
        <View style={styles.summaryGrid}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Identidad</Text>
            <Fact label="Orden" value={order.id} />
            <Fact label="Organización" value={order.organizationId || 'Sin organización'} />
            <Fact label="Propietario" value={order.owner.name || 'Sin nombre'} />
            <Fact label="Correo" value={order.owner.email || 'Sin correo'} />
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Plan</Text>
            <Fact label="Plan" value={order.plan?.name || 'Sin plan'} />
            <Fact label="Unidades" value={String(order.plan?.units || 0)} />
            <Fact label="Importe" value={formatMoney(order.pricing.totalPrice)} />
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Estado</Text>
            <Fact label="Pago" value={order.status.payment || 'unknown'} />
            <Fact label="Activación" value={order.status.activation || 'unknown'} />
            <Fact label="Financiero" value={order.status.financial || 'unknown'} />
            <Fact label="Proveedor" value={order.billing.paymentProvider || 'Sin proveedor'} />
          </View>
        </View>
      ) : null}

      <View style={styles.manualSection}>
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>Validación de transferencia</Text>
            <Text style={styles.bodyText}>La clave de rastreo, el importe y la versión visible se contrastan con la orden antes de activar el servicio.</Text>
          </View>
          <Pressable onPress={() => void loadManual()} style={styles.secondaryButton}><Text style={styles.secondaryText}>Actualizar</Text></Pressable>
        </View>

        {manualLoading ? <View style={styles.stateCard}><ActivityIndicator color={palette.info} /><Text style={styles.bodyText}>Consultando evidencia…</Text></View> : null}
        {manualError ? <View style={[styles.stateCard, styles.errorCard]}><Text style={styles.errorText}>{manualError}</Text></View> : null}
        {!manualLoading && manualData && !evidence ? (
          <View style={styles.stateCard}><Text style={styles.stateTitle}>Sin evidencia SPEI</Text><Text style={styles.bodyText}>El cliente todavía no ha registrado una clave de rastreo para esta orden.</Text></View>
        ) : null}
        {evidence ? <EvidencePanel evidence={evidence} /> : null}

        {evidence && !canManage ? (
          <View style={styles.stateCard}><Text style={styles.stateTitle}>Modo consulta</Text><Text style={styles.bodyText}>Tu rol puede consultar esta operación, pero no aprobar ni rechazar pagos.</Text></View>
        ) : null}

        {canReview ? (
          <View style={styles.reviewCard}>
            <Text style={styles.sectionTitle}>Decisión financiera</Text>
            <Text style={styles.warningText}>Verifica el depósito en la cuenta bancaria de ManeComb antes de aprobar. La evidencia del cliente por sí sola no demuestra que el dinero fue recibido.</Text>

            <View style={styles.decisionRow}>
              <Pressable
                onPress={() => { resetDecisionKey(); setDecision('approve'); }}
                style={[styles.decisionButton, decision === 'approve' && styles.approveActive]}>
                <Text style={styles.decisionText}>Aprobar depósito</Text>
              </Pressable>
              <Pressable
                onPress={() => { resetDecisionKey(); setDecision('reject'); }}
                style={[styles.decisionButton, decision === 'reject' && styles.rejectActive]}>
                <Text style={styles.decisionText}>Rechazar evidencia</Text>
              </Pressable>
            </View>

            {decision === 'approve' ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Confirma la clave de rastreo exacta</Text>
                <TextInput
                  autoCapitalize="characters"
                  onChangeText={(value) => { resetDecisionKey(); setTrackingConfirmation(value); }}
                  placeholder={evidence.trackingKey}
                  placeholderTextColor={palette.mutedSoft}
                  style={styles.input}
                  value={trackingConfirmation}
                />
                <Text style={[styles.helperText, exactTrackingMatch && styles.goodText]}>
                  {exactTrackingMatch ? 'Clave confirmada.' : 'Debe coincidir exactamente con la evidencia recibida.'}
                </Text>
              </View>
            ) : null}

            {decision ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{decision === 'reject' ? 'Motivo del rechazo' : 'Nota de revisión (opcional)'}</Text>
                <TextInput
                  multiline
                  onChangeText={(value) => { resetDecisionKey(); setReviewNote(value); }}
                  placeholder={decision === 'reject' ? 'Explica qué debe corregir el cliente.' : 'Referencia interna de la conciliación.'}
                  placeholderTextColor={palette.mutedSoft}
                  style={[styles.input, styles.textArea]}
                  value={reviewNote}
                />
              </View>
            ) : null}

            {decision ? (
              <Pressable
                disabled={!canSubmitDecision}
                onPress={() => void submitDecision()}
                style={[styles.primaryButton, !canSubmitDecision && styles.disabled]}>
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : null}
                <Text style={styles.primaryText}>
                  {submitting ? 'Procesando…' : decision === 'approve' ? 'Confirmar aprobación y activar' : 'Confirmar rechazo'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {evidence && ['approved', 'rejected'].includes(evidence.status) ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Revisión cerrada</Text>
            <Text style={styles.bodyText}>La decisión quedó registrada y no puede repetirse sobre otra versión de evidencia.</Text>
          </View>
        ) : null}
      </View>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  section: { backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16, borderWidth: 1, flex: 1, flexBasis: 260, gap: 9, padding: 16 },
  sectionTitle: { color: palette.text, fontFamily: Typography.display, fontSize: 17, fontWeight: '900' },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  fact: { backgroundColor: palette.surfaceAlt, borderColor: palette.line, borderRadius: 10, borderWidth: 1, flex: 1, flexBasis: 150, gap: 4, padding: 10 },
  factLabel: { color: palette.muted, fontFamily: Typography.body, fontSize: 11 },
  factValue: { color: palette.text, fontFamily: Typography.body, fontSize: 13, fontWeight: '800' },
  bodyText: { color: palette.muted, fontFamily: Typography.body, fontSize: 12, lineHeight: 18 },
  trackingKey: { color: palette.text, fontFamily: Typography.mono, fontSize: 18, fontWeight: '900', marginTop: 4 },
  badge: { backgroundColor: palette.surfaceAlt, borderRadius: 999, fontFamily: Typography.mono, fontSize: 11, fontWeight: '900', paddingHorizontal: 10, paddingVertical: 6 },
  manualSection: { backgroundColor: palette.card, borderColor: palette.line, borderRadius: 16, borderWidth: 1, gap: 14, padding: 17 },
  evidenceCard: { backgroundColor: palette.cardSoft, borderRadius: 14, borderWidth: 1, gap: 12, padding: 14 },
  noteBox: { backgroundColor: palette.surfaceAlt, borderRadius: 10, gap: 4, padding: 10 },
  reviewCard: { backgroundColor: palette.cardSoft, borderColor: palette.lineStrong, borderRadius: 14, borderWidth: 1, gap: 12, padding: 15 },
  warningText: { backgroundColor: 'rgba(240, 167, 37, 0.10)', borderColor: palette.warning, borderRadius: 10, borderWidth: 1, color: palette.text, fontFamily: Typography.body, fontSize: 12, lineHeight: 18, padding: 10 },
  decisionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  decisionButton: { backgroundColor: palette.surfaceAlt, borderColor: palette.lineStrong, borderRadius: 10, borderWidth: 1, minHeight: 42, paddingHorizontal: 14, paddingVertical: 10 },
  approveActive: { borderColor: palette.success },
  rejectActive: { borderColor: palette.danger },
  decisionText: { color: palette.text, fontFamily: Typography.body, fontSize: 12, fontWeight: '900' },
  fieldGroup: { gap: 6 },
  label: { color: palette.muted, fontFamily: Typography.body, fontSize: 11, fontWeight: '800' },
  input: { backgroundColor: palette.surfaceAlt, borderColor: palette.lineStrong, borderRadius: 10, borderWidth: 1, color: palette.text, fontFamily: Typography.body, fontSize: 13, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10 },
  textArea: { minHeight: 86, textAlignVertical: 'top' },
  helperText: { color: palette.muted, fontFamily: Typography.body, fontSize: 11 },
  goodText: { color: palette.success },
  primaryButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: palette.accent, borderRadius: 10, flexDirection: 'row', gap: 8, minHeight: 44, paddingHorizontal: 16 },
  primaryText: { color: '#FFFFFF', fontFamily: Typography.body, fontSize: 12, fontWeight: '900' },
  secondaryButton: { alignItems: 'center', borderColor: palette.lineStrong, borderRadius: 10, borderWidth: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: 13 },
  secondaryText: { color: palette.text, fontFamily: Typography.body, fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  stateCard: { alignItems: 'flex-start', backgroundColor: palette.cardSoft, borderColor: palette.line, borderRadius: 12, borderWidth: 1, gap: 8, padding: 13 },
  stateTitle: { color: palette.text, fontFamily: Typography.body, fontSize: 13, fontWeight: '900' },
  errorCard: { borderColor: palette.danger },
  errorText: { color: palette.danger, fontFamily: Typography.body, fontSize: 12, lineHeight: 18 },
});
