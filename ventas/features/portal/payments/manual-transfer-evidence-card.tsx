import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { apiClient, getApiErrorMessage } from '@/src/api/client';
import { AppTheme, Typography } from '@/constants/theme';
import { formatCurrency, formatDate } from '@/src/utils/format';
import { PortalSectionCard } from '../cards';
import { portalButtonGradient, portalPalette } from '../portal-theme';

type ManualPaymentEvidence = {
  id: string;
  orderId: string;
  trackingKey: string;
  originBank: string;
  transferDate: string | null;
  amount: number;
  amountMinor: number;
  currency: string;
  note: string;
  status: 'pending_review' | 'reviewing' | 'approved' | 'rejected' | string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  version: number;
};

type ManualPaymentPortalPayload = {
  eligible: boolean;
  reason: string;
  order: {
    id: string;
    referenceCode: string;
    paymentStatus: string;
    activationStatus: string;
    expectedAmount: number;
    currency: string;
  };
  evidence: ManualPaymentEvidence | null;
};

type Props = {
  orderId: string;
};

function createIdempotencyKey() {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 18)}`;
}

function statusCopy(evidence: ManualPaymentEvidence) {
  if (evidence.status === 'approved') {
    return {
      icon: 'check-decagram-outline' as const,
      title: 'Transferencia aprobada',
      text: 'ManeComb validó la evidencia SPEI. La activación del plan se sincroniza desde el backend.',
      tone: portalPalette.success,
      soft: portalPalette.successSoft,
    };
  }
  if (evidence.status === 'rejected') {
    return {
      icon: 'alert-circle-outline' as const,
      title: 'Evidencia rechazada',
      text: evidence.reviewNote || 'Corrige los datos de la transferencia y vuelve a enviarlos.',
      tone: portalPalette.danger,
      soft: portalPalette.dangerSoft,
    };
  }
  return {
    icon: evidence.status === 'reviewing' ? 'shield-search-outline' as const : 'clock-check-outline' as const,
    title: evidence.status === 'reviewing' ? 'Validación en curso' : 'Evidencia recibida',
    text: 'La orden permanece pendiente hasta que un administrador autorizado valide la transferencia.',
    tone: portalPalette.warning,
    soft: portalPalette.warningSoft,
  };
}

export function ManualTransferEvidenceCard({ orderId }: Props) {
  const [data, setData] = useState<ManualPaymentPortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackingKey, setTrackingKey] = useState('');
  const [originBank, setOriginBank] = useState('');
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const idempotencyKeyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<{ data: ManualPaymentPortalPayload }>(
        `/commercial/manual-payments/orders/${encodeURIComponent(orderId)}/evidence`
      );
      setData(response.data.data);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible consultar la validación SPEI.'));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const resetSubmissionKey = () => {
    idempotencyKeyRef.current = null;
  };

  const submit = async () => {
    if (!data?.order?.expectedAmount || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = idempotencyKeyRef.current || createIdempotencyKey();
      idempotencyKeyRef.current = idempotencyKey;
      const response = await apiClient.post<{ data: ManualPaymentPortalPayload }>(
        `/commercial/manual-payments/orders/${encodeURIComponent(orderId)}/evidence`,
        {
          trackingKey,
          originBank,
          transferDate,
          amount: data.order.expectedAmount,
          note,
        },
        { headers: { 'Idempotency-Key': idempotencyKey } }
      );
      setData(response.data.data);
      setTrackingKey('');
      setOriginBank('');
      setNote('');
      idempotencyKeyRef.current = null;
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No fue posible registrar la evidencia SPEI.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PortalSectionCard title="Validación SPEI" subtitle="Consultando la evidencia de transferencia vinculada a tu orden.">
        <View style={styles.loadingRow}>
          <ActivityIndicator color={portalPalette.info} />
          <Text style={styles.helpText}>Verificando el estado con ManeComb…</Text>
        </View>
      </PortalSectionCard>
    );
  }

  if (!data && error) {
    return (
      <PortalSectionCard title="Validación SPEI">
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => void load()} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Reintentar</Text>
        </Pressable>
      </PortalSectionCard>
    );
  }

  if (!data) return null;
  const evidence = data.evidence;
  const canSubmit = data.eligible && (!evidence || evidence.status === 'rejected');

  if (!canSubmit && !evidence) return null;

  return (
    <PortalSectionCard
      title="Validación SPEI"
      subtitle={`Orden ${data.order.referenceCode || data.order.id} · ${formatCurrency(data.order.expectedAmount, data.order.currency || 'MXN')}`}>
      {evidence ? (
        <View style={[styles.statusPanel, { backgroundColor: statusCopy(evidence).soft, borderColor: statusCopy(evidence).tone }]}>
          <MaterialCommunityIcons name={statusCopy(evidence).icon} size={23} color={statusCopy(evidence).tone} />
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>{statusCopy(evidence).title}</Text>
            <Text style={styles.statusText}>{statusCopy(evidence).text}</Text>
            <Text selectable style={styles.mono}>Clave de rastreo: {evidence.trackingKey}</Text>
            <Text style={styles.metaText}>
              {evidence.originBank ? `${evidence.originBank} · ` : ''}
              {formatCurrency(evidence.amount, evidence.currency || 'MXN')} · {formatDate(evidence.transferDate, { fallback: 'Fecha sin registro' })}
            </Text>
          </View>
        </View>
      ) : null}

      {canSubmit ? (
        <View style={styles.form}>
          <View style={styles.formIntro}>
            <MaterialCommunityIcons name="bank-check" size={22} color={portalPalette.info} />
            <View style={styles.statusCopy}>
              <Text style={styles.statusTitle}>{evidence?.status === 'rejected' ? 'Corrige y reenvía la evidencia' : 'Ya hice la transferencia'}</Text>
              <Text style={styles.helpText}>
                Ingresa la clave de rastreo SPEI. El importe no se puede editar: debe coincidir exactamente con tu orden.
              </Text>
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldWide}>
              <Text style={styles.label}>Clave de rastreo SPEI</Text>
              <TextInput
                autoCapitalize="characters"
                onChangeText={(value) => { resetSubmissionKey(); setTrackingKey(value); }}
                placeholder="Ej. ABC123456789"
                placeholderTextColor={portalPalette.mutedSoft}
                style={styles.input}
                value={trackingKey}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Banco de origen</Text>
              <TextInput
                onChangeText={(value) => { resetSubmissionKey(); setOriginBank(value); }}
                placeholder="Opcional"
                placeholderTextColor={portalPalette.mutedSoft}
                style={styles.input}
                value={originBank}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Fecha de transferencia</Text>
              <TextInput
                onChangeText={(value) => { resetSubmissionKey(); setTransferDate(value); }}
                placeholder="AAAA-MM-DD"
                placeholderTextColor={portalPalette.mutedSoft}
                style={styles.input}
                value={transferDate}
              />
            </View>
          </View>

          <View>
            <Text style={styles.label}>Nota</Text>
            <TextInput
              multiline
              onChangeText={(value) => { resetSubmissionKey(); setNote(value); }}
              placeholder="Opcional: últimos datos que ayuden a localizar el depósito"
              placeholderTextColor={portalPalette.mutedSoft}
              style={[styles.input, styles.textArea]}
              value={note}
            />
          </View>

          <View style={styles.amountLock}>
            <MaterialCommunityIcons name="lock-check-outline" size={18} color={portalPalette.accent} />
            <Text style={styles.amountText}>
              Importe a validar: {formatCurrency(data.order.expectedAmount, data.order.currency || 'MXN')}
            </Text>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={submitting || trackingKey.trim().length < 6 || !transferDate.trim()}
            onPress={() => void submit()}
            style={[
              styles.submitButton,
              portalButtonGradient(),
              (submitting || trackingKey.trim().length < 6 || !transferDate.trim()) && styles.disabled,
            ]}>
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <MaterialCommunityIcons name="shield-check-outline" size={19} color="#FFFFFF" />}
            <Text style={styles.submitText}>{submitting ? 'Enviando…' : 'Enviar a validación'}</Text>
          </Pressable>
        </View>
      ) : null}
    </PortalSectionCard>
  );
}

const styles = StyleSheet.create({
  loadingRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  statusPanel: { alignItems: 'flex-start', borderRadius: AppTheme.radius.sm, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 13 },
  statusCopy: { flex: 1, gap: 4, minWidth: 0 },
  statusTitle: { color: portalPalette.text, fontFamily: Typography.body, fontSize: 14, fontWeight: '900' },
  statusText: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 12, lineHeight: 18 },
  metaText: { color: portalPalette.mutedSoft, fontFamily: Typography.body, fontSize: 11 },
  mono: { color: portalPalette.text, fontFamily: Typography.mono, fontSize: 11 },
  form: { gap: 12 },
  formIntro: { alignItems: 'flex-start', flexDirection: 'row', gap: 9 },
  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { flex: 1, flexBasis: 180, gap: 5 },
  fieldWide: { flex: 2, flexBasis: 260, gap: 5 },
  label: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 11, fontWeight: '800' },
  input: { backgroundColor: portalPalette.surfaceSoft, borderColor: portalPalette.line, borderRadius: AppTheme.radius.sm, borderWidth: 1, color: portalPalette.text, fontFamily: Typography.body, fontSize: 13, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10 },
  textArea: { minHeight: 82, textAlignVertical: 'top' },
  amountLock: { alignItems: 'center', backgroundColor: portalPalette.infoSoft, borderColor: portalPalette.line, borderRadius: AppTheme.radius.sm, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 11 },
  amountText: { color: portalPalette.text, fontFamily: Typography.body, fontSize: 12, fontWeight: '800' },
  submitButton: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: AppTheme.radius.sm, flexDirection: 'row', gap: 8, minHeight: 44, paddingHorizontal: 16 },
  submitText: { color: '#FFFFFF', fontFamily: Typography.body, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  errorText: { color: portalPalette.danger, fontFamily: Typography.body, fontSize: 12, lineHeight: 18 },
  helpText: { color: portalPalette.muted, fontFamily: Typography.body, fontSize: 12, lineHeight: 18 },
  secondaryButton: { alignSelf: 'flex-start', borderColor: portalPalette.line, borderRadius: AppTheme.radius.sm, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  secondaryText: { color: portalPalette.text, fontFamily: Typography.body, fontSize: 12, fontWeight: '800' },
});
