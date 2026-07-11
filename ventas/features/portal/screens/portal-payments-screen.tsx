import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { ConfirmModal } from '@/src/components/ui/confirm-modal';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { PortalSectionCard, formatPortalStatus, getPortalStatusTone } from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { portalButtonGradient, portalPalette } from '../portal-theme';
import { usePortalStore } from '../store/use-portal-store';
import type { PortalPaymentMethod } from '@/src/types/app';
import { formatCurrency, formatDate } from '@/src/utils/format';

type PaymentField = 'brand' | 'cardNumber' | 'expMonth' | 'expYear';
type FormErrors = Partial<Record<PaymentField, string>>;
type FeedbackTone = 'success' | 'danger' | 'info';

const cardBrandOptions = ['Visa', 'Mastercard', 'American Express', 'Carnet'] as const;

function getMethodName(method: PortalPaymentMethod) {
  if (method.type === 'spei') {
    return 'Transferencia SPEI';
  }

  return method.brand || 'Tarjeta';
}

function getMethodDetail(method: PortalPaymentMethod) {
  if (method.type === 'spei') {
    return 'Cuenta bancaria para pagos por transferencia';
  }

  return `Terminación ${method.last4 || '----'}${method.expMonth && method.expYear ? ` · ${method.expMonth}/${method.expYear}` : ''}`;
}

function normalizeDigits(value: string, maxLength: number) {
  return value.replace(/[^\d]/g, '').slice(0, maxLength);
}

function PaymentInput({
  error,
  focused,
  keyboardType,
  label,
  maxLength,
  onBlur,
  onChangeText,
  onFocus,
  placeholder,
  value,
}: {
  error?: string;
  focused: boolean;
  keyboardType?: 'default' | 'number-pad';
  label: string;
  maxLength?: number;
  onBlur: () => void;
  onChangeText: (value: string) => void;
  onFocus: () => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View style={[styles.field, styles.comboField]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={portalPalette.mutedSoft}
        keyboardType={keyboardType}
        maxLength={maxLength}
        onBlur={onBlur}
        onFocus={onFocus}
        style={[
          styles.input,
          focused ? styles.inputFocused : undefined,
          error ? styles.inputError : undefined,
        ]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function CardBrandCombo({
  error,
  onSelect,
  value,
}: {
  error?: string;
  onSelect: (value: string) => void;
  value: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Tarjeta</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Seleccionar marca de tarjeta"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={[styles.comboButton, open ? styles.inputFocused : undefined, error ? styles.inputError : undefined]}>
        <Text style={[styles.comboValue, !value ? styles.comboPlaceholder : undefined]} numberOfLines={1}>
          {value || 'Selecciona tarjeta'}
        </Text>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={portalPalette.muted}
        />
      </Pressable>
      {open ? (
        <View style={styles.comboMenu}>
          {cardBrandOptions.map((option) => {
            const active = value === option;

            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityLabel={`Seleccionar ${option}`}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  onSelect(option);
                  setOpen(false);
                }}
                style={[styles.comboOption, active ? styles.comboOptionActive : undefined]}>
                <MaterialCommunityIcons
                  name="credit-card-outline"
                  size={16}
                  color={active ? portalPalette.info : portalPalette.muted}
                />
                <Text style={[styles.comboOptionText, active ? styles.comboOptionTextActive : undefined]}>
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function PaymentWalletCard({
  method,
  onDelete,
  onEdit,
  onDefault,
}: {
  method: PortalPaymentMethod;
  onDelete: () => void;
  onEdit: () => void;
  onDefault: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isCard = method.type === 'card';

  return (
    <Pressable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.walletCard, hovered ? styles.walletCardHover : undefined]}>
      <View style={styles.walletHeader}>
        <View style={styles.walletBrandCluster}>
          <View style={styles.walletIcon}>
            <MaterialCommunityIcons
              name={isCard ? 'credit-card-chip-outline' : 'bank-outline'}
              size={24}
              color={isCard ? portalPalette.accent : portalPalette.info}
            />
          </View>
          <View style={styles.walletCopy}>
            <Text style={styles.walletTitle} numberOfLines={1}>{getMethodName(method)}</Text>
            <Text style={styles.walletMeta} numberOfLines={2}>{getMethodDetail(method)}</Text>
          </View>
        </View>
        <View style={styles.walletBadges}>
          {method.isDefault ? <StatusBadge label="Principal" tone="positive" /> : null}
        </View>
      </View>

      <View style={styles.walletFooter}>
        <View style={styles.walletSecurity}>
          <MaterialCommunityIcons name="shield-check-outline" size={16} color={portalPalette.success} />
          <Text style={styles.walletSecurityText}>Referencia segura</Text>
        </View>
        <View style={styles.walletActions}>
          {isCard ? (
            <Pressable
              accessibilityLabel="Editar método de pago"
              accessibilityRole="button"
              onPress={onEdit}
              style={styles.walletActionButton}>
              <MaterialCommunityIcons name="pencil-outline" size={15} color={portalPalette.text} />
              <Text style={styles.walletActionText} numberOfLines={1}>Editar</Text>
            </Pressable>
          ) : null}
          {!method.isDefault ? (
            <Pressable
              accessibilityLabel="Marcar método de pago como principal"
              accessibilityRole="button"
              onPress={onDefault}
              style={styles.walletActionButton}>
              <MaterialCommunityIcons name="star-outline" size={15} color={portalPalette.info} />
              <Text style={[styles.walletActionText, { color: portalPalette.info }]} numberOfLines={1}>Principal</Text>
            </Pressable>
          ) : null}
          {isCard ? (
            <Pressable
              accessibilityLabel="Eliminar método de pago"
              accessibilityRole="button"
              onPress={onDelete}
              style={[styles.walletActionButton, styles.walletDangerButton]}>
              <MaterialCommunityIcons name="trash-can-outline" size={15} color={portalPalette.danger} />
              <Text style={[styles.walletActionText, { color: portalPalette.danger }]} numberOfLines={1}>Eliminar</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function EmptyPaymentMethods() {
  return (
    <View style={styles.emptyWallet}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name="credit-card-plus-outline" size={30} color={portalPalette.info} />
      </View>
      <View style={styles.emptyCopy}>
        <Text style={styles.emptyTitle}>No tienes métodos de pago registrados</Text>
        <Text style={styles.emptyText}>Completa el formulario para agregar tu primera referencia de pago.</Text>
      </View>
    </View>
  );
}

export function PortalPaymentsScreen() {
  const { width } = useWindowDimensions();
  const isTwoColumn = width >= 1180;
  const {
    createPaymentMethod,
    deletePaymentMethod,
    isSubmitting,
    loadOverview,
    loadPaymentMethods,
    paymentMethods,
    setDefaultPaymentMethod,
    subscription,
    updatePaymentMethod,
  } = usePortalStore(
    useShallow((state) => ({
      createPaymentMethod: state.createPaymentMethod,
      deletePaymentMethod: state.deletePaymentMethod,
      isSubmitting: state.isSubmitting,
      loadOverview: state.loadOverview,
      loadPaymentMethods: state.loadPaymentMethods,
      paymentMethods: state.paymentMethods,
      setDefaultPaymentMethod: state.setDefaultPaymentMethod,
      subscription: state.subscription,
      updatePaymentMethod: state.updatePaymentMethod,
    }))
  );
  const [brand, setBrand] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<PaymentField | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PortalPaymentMethod | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<FeedbackTone>('info');

  useEffect(() => {
    void loadPaymentMethods();
    void loadOverview();
  }, [loadOverview, loadPaymentMethods]);

  const nextChargeAmount = subscription?.monthlyPrice || 0;
  const nextChargeCurrency = subscription?.currency || 'MXN';
  const nextChargeDate = subscription?.currentPeriodEnd || null;

  const resetForm = () => {
    setBrand('');
    setCardNumber('');
    setExpMonth('');
    setExpYear('');
    setEditingId(null);
    setErrors({});
  };

  const validateForm = () => {
    const normalizedBrand = brand.trim();
    const normalizedCardNumber = normalizeDigits(cardNumber, 4);
    const normalizedMonth = normalizeDigits(expMonth, 2);
    const normalizedYear = normalizeDigits(expYear, 2);
    const monthNumber = Number(normalizedMonth);
    const nextErrors: FormErrors = {};

    if (!normalizedBrand) {
      nextErrors.brand = 'Marca requerida.';
    }

    if (normalizedCardNumber.length !== 4) {
      nextErrors.cardNumber = 'Ingresa los últimos 4 dígitos.';
    }

    if (!normalizedMonth || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
      nextErrors.expMonth = 'MM entre 01 y 12.';
    }

    if (normalizedYear.length !== 2) {
      nextErrors.expYear = 'AA requerido.';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length) {
      setMessage('Revisa los campos marcados antes de continuar.');
      setMessageTone('danger');
      return null;
    }

    return {
      brand: normalizedBrand,
      last4: normalizedCardNumber,
      expMonth: String(monthNumber).padStart(2, '0'),
      expYear: normalizedYear,
    };
  };

  const submit = async () => {
    const payload = validateForm();

    if (!payload) {
      return;
    }

    const result = editingId
      ? await updatePaymentMethod(editingId, payload)
      : await createPaymentMethod(payload);

    setMessage(
      result.ok
        ? editingId
          ? 'Método actualizado.'
          : 'Tarjeta agregada.'
        : result.message || 'No fue posible guardar el método.'
    );
    setMessageTone(result.ok ? 'success' : 'danger');

    if (result.ok) {
      resetForm();
    }
  };

  const editMethod = (method: PortalPaymentMethod) => {
    setEditingId(method.id);
    setBrand(method.brand || '');
    setCardNumber('');
    setExpMonth(method.expMonth || '');
    setExpYear(method.expYear || '');
    setErrors({});
    setMessage('Editando método guardado. Ingresa solo los últimos 4 dígitos.');
    setMessageTone('info');
  };

  const markDefault = async (method: PortalPaymentMethod) => {
    const result = await setDefaultPaymentMethod(method.id);
    setMessage(result.ok ? 'Método principal actualizado.' : result.message || 'No fue posible actualizar el método principal.');
    setMessageTone(result.ok ? 'success' : 'danger');
  };

  const formSubtitle = editingId
    ? 'Actualiza la marca, terminación y vigencia de la referencia.'
    : 'Registra solo la terminación. ManeComb no almacena el número completo de tu tarjeta.';

  return (
    <PortalLayout title="Métodos de pago" subtitle="Administra las referencias disponibles y define el método principal.">
      <View style={[styles.columns, isTwoColumn ? styles.columnsWide : styles.columnsStack]}>
        <View style={[styles.leftColumn, !isTwoColumn ? styles.fullColumn : undefined]}>
          <PortalSectionCard
            title="Métodos guardados"
            subtitle={paymentMethods.length ? `${paymentMethods.length} ${paymentMethods.length === 1 ? 'método disponible' : 'métodos disponibles'}` : undefined}>
            {paymentMethods.length ? (
              <View style={styles.walletGrid}>
                {paymentMethods.map((method) => (
                  <PaymentWalletCard
                    key={method.id}
                    method={method}
                    onDefault={() => void markDefault(method)}
                    onDelete={() => setDeleteTarget(method)}
                    onEdit={() => editMethod(method)}
                  />
                ))}
              </View>
            ) : (
              <EmptyPaymentMethods />
            )}
          </PortalSectionCard>

          <PortalSectionCard
            title={editingId ? 'Editar referencia de pago' : 'Agregar método de pago'}
            subtitle={formSubtitle}
          >
            <View style={styles.securityNote}>
              <MaterialCommunityIcons name="lock-check-outline" size={18} color={portalPalette.success} />
              <Text style={styles.securityNoteText}>Ingresa solo los últimos 4 dígitos. ManeComb no captura ni guarda el número completo.</Text>
            </View>

            {message ? (
              <View style={[styles.feedback, styles[`feedback_${messageTone}`]]}>
                <MaterialCommunityIcons
                  name={messageTone === 'success' ? 'check-circle-outline' : messageTone === 'danger' ? 'alert-circle-outline' : 'information-outline'}
                  size={18}
                  color={messageTone === 'success' ? portalPalette.success : messageTone === 'danger' ? portalPalette.danger : portalPalette.info}
                />
                <Text style={styles.feedbackText}>{message}</Text>
              </View>
            ) : null}

            <View style={styles.formGrid}>
              <View style={styles.formMedium}>
                <CardBrandCombo
                  value={brand}
                  error={errors.brand}
                  onSelect={(value) => {
                    setBrand(value);
                    setErrors((current) => ({ ...current, brand: undefined }));
                  }}
                />
              </View>
              <View style={styles.formWide}>
                <PaymentInput
                  label="Últimos 4 dígitos"
                  placeholder="1234"
                  value={cardNumber}
                  error={errors.cardNumber}
                  focused={focusedField === 'cardNumber'}
                  keyboardType="number-pad"
                  maxLength={4}
                  onFocus={() => setFocusedField('cardNumber')}
                  onBlur={() => setFocusedField(null)}
                  onChangeText={(value) => {
                    setCardNumber(normalizeDigits(value, 4));
                    setErrors((current) => ({ ...current, cardNumber: undefined }));
                  }}
                />
              </View>
              <View style={styles.formSmall}>
                <PaymentInput
                  label="MM"
                  placeholder="08"
                  value={expMonth}
                  error={errors.expMonth}
                  focused={focusedField === 'expMonth'}
                  keyboardType="number-pad"
                  maxLength={2}
                  onFocus={() => setFocusedField('expMonth')}
                  onBlur={() => setFocusedField(null)}
                  onChangeText={(value) => {
                    setExpMonth(normalizeDigits(value, 2));
                    setErrors((current) => ({ ...current, expMonth: undefined }));
                  }}
                />
              </View>
              <View style={styles.formSmall}>
                <PaymentInput
                  label="AA"
                  placeholder="28"
                  value={expYear}
                  error={errors.expYear}
                  focused={focusedField === 'expYear'}
                  keyboardType="number-pad"
                  maxLength={2}
                  onFocus={() => setFocusedField('expYear')}
                  onBlur={() => setFocusedField(null)}
                  onChangeText={(value) => {
                    setExpYear(normalizeDigits(value, 2));
                    setErrors((current) => ({ ...current, expYear: undefined }));
                  }}
                />
              </View>
            </View>

            <View style={styles.formActions}>
              {editingId ? (
                <Pressable accessibilityRole="button" onPress={resetForm} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Cancelar edición</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={editingId ? 'Guardar cambios del método' : 'Agregar método de pago'}
                onPress={() => void submit()}
                disabled={isSubmitting}
                style={[styles.primaryButton, portalButtonGradient(), isSubmitting ? styles.disabledButton : undefined]}>
                <MaterialCommunityIcons name={editingId ? 'content-save-outline' : 'plus'} size={18} color="#FFFFFF" />
                <Text style={styles.primaryText}>{editingId ? 'Guardar cambios' : 'Agregar tarjeta'}</Text>
              </Pressable>
            </View>
          </PortalSectionCard>
        </View>

        <View style={[styles.rightColumn, !isTwoColumn ? styles.fullColumn : undefined]}>
          <PortalSectionCard title="Próximo cobro" subtitle="Resumen del siguiente periodo.">
            <View style={styles.nextChargeCard}>
              <View style={styles.nextChargeTop}>
                <View>
                  <Text style={styles.sideKicker}>Plan actual</Text>
                  <Text style={styles.nextPlan} numberOfLines={2}>{subscription?.planName || 'Plan comercial'}</Text>
                </View>
                <StatusBadge label={formatPortalStatus(subscription?.status || 'inactive')} tone={getPortalStatusTone(subscription?.status || 'inactive')} />
              </View>
              <Text style={styles.nextAmount}>{formatCurrency(nextChargeAmount, nextChargeCurrency)}</Text>
              <Text style={styles.nextDate}>{nextChargeDate ? `Programado para ${formatDate(nextChargeDate)}` : 'Fecha pendiente de confirmación'}</Text>
            </View>
          </PortalSectionCard>
        </View>
      </View>

      <ConfirmModal
        visible={Boolean(deleteTarget)}
        destructive
        title="Eliminar tarjeta"
        description={`Se eliminará ${deleteTarget?.brand || 'esta tarjeta'} como método de pago.`}
        confirmLabel="Eliminar"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) {
            void deletePaymentMethod(target.id).then((result) => {
              setMessage(result.ok ? 'Método eliminado.' : result.message || 'No fue posible eliminar el método.');
              setMessageTone(result.ok ? 'success' : 'danger');
            });
          }
        }}
      />
    </PortalLayout>
  );
}

const styles = StyleSheet.create({
  columns: {
    gap: AppTheme.spacing.md,
    minWidth: 0,
  },
  columnsWide: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  columnsStack: {
    flexDirection: 'column',
  },
  leftColumn: {
    flex: 7,
    gap: AppTheme.spacing.md,
    minWidth: 0,
  },
  rightColumn: {
    flex: 3,
    gap: AppTheme.spacing.md,
    minWidth: 0,
  },
  fullColumn: {
    width: '100%',
  },
  walletGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    minWidth: 0,
  },
  walletCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.052)',
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flex: 1,
    flexBasis: 300,
    gap: 16,
    minHeight: 160,
    minWidth: 0,
    overflow: 'hidden',
    padding: AppTheme.spacing.md,
  },
  walletCardHover: {
    backgroundColor: 'rgba(35, 213, 255, 0.07)',
    borderColor: 'rgba(35, 213, 255, 0.24)',
  },
  walletHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  walletBrandCluster: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    minWidth: 0,
  },
  walletIcon: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  walletCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  walletTitle: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 16,
    fontWeight: '900',
    minWidth: 0,
  },
  walletMeta: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
    minWidth: 0,
  },
  walletBadges: {
    alignItems: 'flex-start',
    flexShrink: 0,
  },
  walletFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 'auto',
    minWidth: 0,
  },
  walletSecurity: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 6,
    minWidth: 0,
  },
  walletSecurityText: {
    color: portalPalette.muted,
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    minWidth: 0,
  },
  walletActions: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
    minWidth: 150,
  },
  walletActionButton: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 34,
    minWidth: 38,
    paddingHorizontal: 10,
  },
  walletDangerButton: {
    backgroundColor: portalPalette.dangerSoft,
    borderColor: 'rgba(255, 90, 122, 0.22)',
  },
  walletActionText: {
    color: portalPalette.text,
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    minWidth: 0,
  },
  emptyWallet: {
    alignItems: 'center',
    backgroundColor: 'rgba(35, 213, 255, 0.055)',
    borderColor: 'rgba(35, 213, 255, 0.18)',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    gap: 12,
    padding: AppTheme.spacing.lg,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: portalPalette.infoSoft,
    borderRadius: 18,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  emptyCopy: {
    alignItems: 'center',
    gap: 4,
    maxWidth: 420,
  },
  emptyTitle: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyText: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  securityNote: {
    alignItems: 'center',
    backgroundColor: portalPalette.successSoft,
    borderColor: 'rgba(82, 242, 167, 0.18)',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  securityNoteText: {
    color: portalPalette.text,
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
    minWidth: 0,
  },
  feedback: {
    alignItems: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  feedback_success: {
    backgroundColor: portalPalette.successSoft,
    borderColor: 'rgba(82, 242, 167, 0.26)',
  },
  feedback_danger: {
    backgroundColor: portalPalette.dangerSoft,
    borderColor: 'rgba(255, 90, 122, 0.28)',
  },
  feedback_info: {
    backgroundColor: portalPalette.infoSoft,
    borderColor: 'rgba(35, 213, 255, 0.22)',
  },
  feedbackText: {
    color: portalPalette.text,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 18,
    minWidth: 0,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    minWidth: 0,
  },
  formWide: {
    flex: 1,
    flexBasis: 260,
    minWidth: 0,
  },
  formMedium: {
    flex: 1,
    flexBasis: 160,
    minWidth: 0,
  },
  formSmall: {
    flex: 1,
    flexBasis: 96,
    minWidth: 84,
  },
  field: {
    gap: 7,
    minWidth: 0,
  },
  comboField: {
    position: 'relative',
    zIndex: 20,
  },
  fieldLabel: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: 'rgba(7, 10, 18, 0.45)',
    borderColor: portalPalette.lineStrong,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 14,
    minHeight: 46,
    minWidth: 0,
    paddingHorizontal: 14,
  },
  comboButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(7, 10, 18, 0.45)',
    borderColor: portalPalette.lineStrong,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 46,
    minWidth: 0,
    paddingHorizontal: 14,
  },
  comboValue: {
    color: portalPalette.text,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 14,
    minWidth: 0,
  },
  comboPlaceholder: {
    color: portalPalette.mutedSoft,
  },
  comboMenu: {
    backgroundColor: portalPalette.surfaceStrong,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 74,
    zIndex: 30,
    gap: 6,
    padding: 8,
  },
  comboOption: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 10,
  },
  comboOptionActive: {
    backgroundColor: portalPalette.infoSoft,
  },
  comboOptionText: {
    color: portalPalette.text,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
    minWidth: 0,
  },
  comboOptionTextActive: {
    color: portalPalette.info,
    fontWeight: '900',
  },
  inputFocused: {
    backgroundColor: 'rgba(35, 213, 255, 0.055)',
    borderColor: 'rgba(35, 213, 255, 0.48)',
  },
  inputError: {
    backgroundColor: portalPalette.dangerSoft,
    borderColor: 'rgba(255, 90, 122, 0.5)',
  },
  fieldError: {
    color: portalPalette.danger,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
  },
  formActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 16,
  },
  primaryText: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  secondaryText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.55,
  },
  nextChargeCard: {
    backgroundColor: 'rgba(240, 68, 95, 0.085)',
    borderColor: 'rgba(240, 68, 95, 0.2)',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    gap: 12,
    padding: AppTheme.spacing.md,
  },
  nextChargeTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  sideKicker: {
    color: portalPalette.mutedSoft,
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  nextPlan: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
    minWidth: 0,
  },
  nextAmount: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
  },
  nextDate: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
});
