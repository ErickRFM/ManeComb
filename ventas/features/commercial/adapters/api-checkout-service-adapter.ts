import {
  createCommercialCheckoutRequest,
  confirmCommercialPaymentRequest,
  getApiErrorMessage,
  getCommercialPlansRequest,
  getRuntimeHealthRequest,
} from '@/src/api/client';
import type { CheckoutService } from '../contracts';
import { validateTestCard } from '../services/checkout-validation';
import {
  PAYMENT_SESSION_STATUSES,
  type PaymentProviderMode,
  type PaymentResult,
  type PaymentReturnRequest,
  type PaymentSessionRequest,
  type TestCardInput,
} from '../types';

type LegacyPaymentInstructions = {
  type?: string;
  brandName?: string;
  legalName?: string;
  accountHolder?: string;
  clabe?: string;
  bankName?: string | null;
  amount?: number;
  currency?: string;
  reference?: string;
  concept?: string;
  summary?: string;
  details?: string[];
};

type LegacyCheckoutResponse = {
  id?: string;
  planId?: string;
  planName?: string;
  totalPrice?: number;
  currency?: string;
  checkoutUrl?: string;
  createdAt?: string;
  referenceCode?: string;
  status?: string;
  paymentStatus?: string;
  paymentProvider?: string;
  nextStep?: string;
  paymentInstructions?: LegacyPaymentInstructions | null;
};

function resolveResultStatus(response: LegacyCheckoutResponse) {
  const paymentStatus = String(response.paymentStatus || '').toLowerCase();
  const accountStatus = String(response.status || '').toLowerCase();
  if (response.checkoutUrl) return PAYMENT_SESSION_STATUSES.REDIRECT_REQUIRED;
  if (['paid', 'trial_active'].includes(paymentStatus) || ['active', 'trial'].includes(accountStatus)) {
    return PAYMENT_SESSION_STATUSES.COMPLETED;
  }
  if (paymentStatus.includes('pending') || accountStatus.includes('pending')) return PAYMENT_SESSION_STATUSES.PENDING;
  return PAYMENT_SESSION_STATUSES.PREPARING;
}

function buildManualTransferNextStep(instructions?: LegacyPaymentInstructions | null) {
  if (!instructions) return '';

  const amount = Number(instructions.amount || 0);
  const amountLabel = amount > 0
    ? `${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${instructions.currency || 'MXN'}`
    : '';
  const rows = [
    instructions.summary,
    instructions.bankName ? `Banco: ${instructions.bankName}` : '',
    instructions.accountHolder ? `Titular: ${instructions.accountHolder}` : '',
    instructions.clabe ? `CLABE: ${instructions.clabe}` : '',
    amountLabel ? `Importe: ${amountLabel}` : '',
    instructions.reference ? `Referencia: ${instructions.reference}` : '',
    instructions.concept ? `Concepto: ${instructions.concept}` : '',
    'Tu plan se activará después de validar la transferencia.',
  ];

  return rows.filter(Boolean).join('\n');
}

export class ApiCheckoutServiceAdapter implements CheckoutService {
  async listPlans() {
    // Un fallo de transporte no equivale a un catalogo vacio. El consumidor
    // necesita distinguir ambos estados para no informar que no existen planes.
    const plans = await getCommercialPlansRequest();
    return plans.map((plan) => ({ ...plan }));
  }

  async getProviderMode(): Promise<PaymentProviderMode> {
    const health = await getRuntimeHealthRequest().catch(() => null);
    if (!health) return 'unavailable';

    const paymentReadiness = health?.readiness?.payments;
    const provider = String(paymentReadiness?.provider || health?.payments || '').trim().toLowerCase();

    if (paymentReadiness?.ready === false) return 'unavailable';
    if (provider === 'test') return 'test';
    if (['manual', 'manual_bank_transfer', 'bank_transfer'].includes(provider)) return 'manual';
    if (provider === 'mercado_pago') return 'hosted';

    return 'unavailable';
  }

  validateTestCard(input: TestCardInput) {
    return validateTestCard(input);
  }

  async createPaymentSession(request: PaymentSessionRequest): Promise<PaymentResult> {
    try {
      const { idempotencyKey, ...payload } = request;
      const response = await createCommercialCheckoutRequest(payload, idempotencyKey) as LegacyCheckoutResponse;
      const status = resolveResultStatus(response);
      const manualTransferNextStep = buildManualTransferNextStep(response.paymentInstructions);
      const nextStep = manualTransferNextStep
        || response.nextStep
        || (status === PAYMENT_SESSION_STATUSES.COMPLETED
          ? `${response.planName || 'Tu plan'} quedó ligado a tu portal ManeComb.`
          : 'Revisa el estado desde tu portal ManeComb.');

      return {
        ok: true,
        code: 'SESSION_CREATED',
        message: status === PAYMENT_SESSION_STATUSES.REDIRECT_REQUIRED
          ? 'Continúa en el checkout seguro del proveedor.'
          : response.paymentInstructions
            ? 'La orden quedó registrada. Realiza la transferencia con los datos mostrados.'
            : 'La orden comercial quedó registrada.',
        status,
        session: {
          id: response.id || response.referenceCode || `session-${Date.now()}`,
          planId: response.planId || request.planId,
          providerId: response.paymentProvider || 'legacy-commercial-api',
          status,
          amount: Number(response.totalPrice || 0),
          currency: response.currency || 'MXN',
          checkoutUrl: response.checkoutUrl || null,
          createdAt: response.createdAt || new Date().toISOString(),
        },
        providerReference: response.referenceCode || null,
        planName: response.planName || '',
        nextStep,
        rawStatus: String(response.status || ''),
        rawPaymentStatus: String(response.paymentStatus || ''),
      };
    } catch (error) {
      return {
        ok: false,
        code: 'SESSION_FAILED',
        message: getApiErrorMessage(error, 'No fue posible preparar la compra.'),
        status: PAYMENT_SESSION_STATUSES.FAILED,
        session: null,
        providerReference: null,
        planName: '',
        nextStep: 'Revisa tus datos e inténtalo nuevamente.',
        rawStatus: '',
        rawPaymentStatus: '',
      };
    }
  }

  async confirmPaymentReturn(request: PaymentReturnRequest): Promise<PaymentResult> {
    try {
      const response = await confirmCommercialPaymentRequest({
        externalReference: request.externalReference,
        paymentId: request.paymentId,
      }) as LegacyCheckoutResponse;
      const status = resolveResultStatus(response);
      return {
        ok: true,
        code: 'PAYMENT_RETURN_CONFIRMED',
        message: response.nextStep || 'El estado del pago se sincronizó con tu cuenta.',
        status,
        session: null,
        providerReference: response.referenceCode || request.paymentId,
        planName: response.planName || '',
        nextStep: response.nextStep || 'Revisa el estado en tu portal.',
        rawStatus: String(response.status || ''),
        rawPaymentStatus: String(response.paymentStatus || ''),
      };
    } catch (error) {
      return {
        ok: false,
        code: 'PAYMENT_RETURN_FAILED',
        message: getApiErrorMessage(error, 'No fue posible confirmar el pago.'),
        status: PAYMENT_SESSION_STATUSES.FAILED,
        session: null,
        providerReference: request.paymentId,
        planName: '',
        nextStep: 'Revisa el estado desde tu portal.',
        rawStatus: '',
        rawPaymentStatus: '',
      };
    }
  }
}
