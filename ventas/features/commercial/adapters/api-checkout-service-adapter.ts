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
  nextStep?: string;
  paymentInstructions?: { summary?: string };
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
    const provider = String(health?.readiness?.payments?.provider || health?.payments || '').trim();
    return provider === 'test' ? 'test' : 'hosted';
  }

  validateTestCard(input: TestCardInput) {
    return validateTestCard(input);
  }

  async createPaymentSession(request: PaymentSessionRequest): Promise<PaymentResult> {
    try {
      const response = await createCommercialCheckoutRequest(request) as LegacyCheckoutResponse;
      const status = resolveResultStatus(response);
      const nextStep = response.nextStep
        || response.paymentInstructions?.summary
        || (status === PAYMENT_SESSION_STATUSES.COMPLETED
          ? `${response.planName || 'Tu plan'} quedó ligado a tu portal ManeComb.`
          : 'Revisa el estado desde tu portal ManeComb.');

      return {
        ok: true,
        code: 'SESSION_CREATED',
        message: status === PAYMENT_SESSION_STATUSES.REDIRECT_REQUIRED
          ? 'Continúa en el checkout seguro del proveedor.'
          : 'La orden comercial quedó registrada.',
        status,
        session: {
          id: response.id || response.referenceCode || `session-${Date.now()}`,
          planId: response.planId || request.planId,
          providerId: 'legacy-commercial-api',
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
