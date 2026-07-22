import type {
  CommercialPlan,
  PortalInvoice,
  PortalSubscription,
} from '@/src/types/app';

export const COMMERCIAL_SUBSCRIPTION_STATES = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  CHANGE_SCHEDULED: 'CHANGE_SCHEDULED',
  SUSPENDED: 'SUSPENDED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  INACTIVE: 'INACTIVE',
} as const;

export type CommercialSubscriptionState =
  (typeof COMMERCIAL_SUBSCRIPTION_STATES)[keyof typeof COMMERCIAL_SUBSCRIPTION_STATES];

export const PLAN_CHANGE_KINDS = {
  UPGRADE: 'UPGRADE',
  DOWNGRADE: 'DOWNGRADE',
  SAME_PLAN: 'SAME_PLAN',
} as const;

export type PlanChangeKind = (typeof PLAN_CHANGE_KINDS)[keyof typeof PLAN_CHANGE_KINDS];

export const CHANGE_VALIDATION_CODES = {
  ALLOWED: 'ALLOWED',
  SAME_PLAN: 'SAME_PLAN',
  ACTIVE_USAGE_EXCEEDS_TARGET: 'ACTIVE_USAGE_EXCEEDS_TARGET',
  CHANGE_ALREADY_SCHEDULED: 'CHANGE_ALREADY_SCHEDULED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_CANCELLED: 'ACCOUNT_CANCELLED',
  ACCOUNT_EXPIRED: 'ACCOUNT_EXPIRED',
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  NO_ACTIVE_SUBSCRIPTION: 'NO_ACTIVE_SUBSCRIPTION',
  PLAN_NOT_FOUND: 'PLAN_NOT_FOUND',
} as const;

export type ChangeValidationCode =
  (typeof CHANGE_VALIDATION_CODES)[keyof typeof CHANGE_VALIDATION_CODES];

export type CommercialActionKey =
  | 'COMPARE_PLAN'
  | 'CONTINUE_CHANGE'
  | 'REVIEW_PAYMENT'
  | 'CONTACT_SUPPORT'
  | 'RESOLVE_USAGE'
  | 'NONE';

export type CommercialStatePresentation = {
  state: CommercialSubscriptionState;
  label: string;
  message: string;
  tone: 'positive' | 'warning' | 'danger' | 'info' | 'neutral';
  primaryAction: CommercialActionKey;
  actionLabel: string;
  restrictions: string[];
};

export type CommercialPlanView = CommercialPlan & {
  displayName: string;
  description: string;
  benefits: string[];
  indicator: string;
};

export type PlanChangeValidation = {
  allowed: boolean;
  code: ChangeValidationCode;
  changeKind: PlanChangeKind;
  reason: string;
  restrictions: string[];
  expectedState: CommercialSubscriptionState;
  outcome: string;
  nextStep: string;
  action: CommercialActionKey;
  actionLabel: string;
};

export type CommercialPlanSnapshot = {
  id: string | null;
  name: string;
  units: number;
  monthlyPrice: number;
  currency: string;
};

export type CommercialChangeSummary = {
  currentPlan: CommercialPlanSnapshot;
  targetPlan: CommercialPlanSnapshot;
  changeKind: PlanChangeKind;
  unitsDelta: number;
  priceDelta: number;
  benefits: string[];
  validation: PlanChangeValidation;
  expectedStateLabel: string;
  nextStep: string;
};

export const COMMERCIAL_ACTIVITY_TYPES = {
  ACCOUNT_CREATED: 'ACCOUNT_CREATED',
  PLAN_CONTRACTED: 'PLAN_CONTRACTED',
  INVOICE_ISSUED: 'INVOICE_ISSUED',
} as const;

export type CommercialActivityType =
  (typeof COMMERCIAL_ACTIVITY_TYPES)[keyof typeof COMMERCIAL_ACTIVITY_TYPES];

export type CommercialActivity = {
  id: string;
  type: CommercialActivityType;
  title: string;
  description: string;
  occurredAt: string;
  status: 'completed' | 'pending' | 'informative';
  source: 'api';
  metadata?: Record<string, string | number | boolean | null>;
};

export type CommercialContextSnapshot = {
  subscription: PortalSubscription | null;
  plans: CommercialPlan[];
  invoices: PortalInvoice[];
  organizationCreatedAt?: string | null;
};

export type CommercialWorkspace = {
  subscription: PortalSubscription | null;
  state: CommercialStatePresentation;
  plans: CommercialPlanView[];
  currentPlan: CommercialPlanView | null;
  activities: CommercialActivity[];
};

export type CommercialDashboardModel = {
  subscription: PortalSubscription | null;
  state: CommercialStatePresentation;
  currentPlan: CommercialPlanView | null;
  latestInvoice: PortalInvoice | null;
  pendingInvoices: PortalInvoice[];
  totalUnits: number;
  activeUnits: number;
  availableUnits: number;
  recommendation: {
    title: string;
    body: string;
    label: string;
    href:
      | '/portal/plan'
      | '/portal/facturacion'
      | '/portal/pagos'
      | '/portal/onboarding'
      | '/portal/perfil?section=soporte';
    icon: string;
    tone: 'positive' | 'warning' | 'info';
  };
  activities: CommercialActivity[];
};

export const PAYMENT_SESSION_STATUSES = {
  IDLE: 'IDLE',
  PREPARING: 'PREPARING',
  REDIRECT_REQUIRED: 'REDIRECT_REQUIRED',
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

export type PaymentSessionStatus =
  (typeof PAYMENT_SESSION_STATUSES)[keyof typeof PAYMENT_SESSION_STATUSES];

export type PaymentProviderMode = 'hosted' | 'test' | 'unavailable';
export type CheckoutPaymentMethod = 'card' | 'spei' | 'trial';

export type PaymentSessionRequest = {
  idempotencyKey: string;
  planId: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  paymentMethod: CheckoutPaymentMethod;
  requestTrial: boolean;
  selectedAddOns: string[];
};

export type PaymentSession = {
  id: string;
  planId: string;
  providerId: string;
  status: PaymentSessionStatus;
  amount: number;
  currency: string;
  checkoutUrl: string | null;
  createdAt: string;
};

export type PaymentResult = {
  ok: boolean;
  code: string;
  message: string;
  status: PaymentSessionStatus;
  session: PaymentSession | null;
  providerReference: string | null;
  planName: string;
  nextStep: string;
  rawStatus: string;
  rawPaymentStatus: string;
};

export type PaymentReturnRequest = {
  paymentId: string;
  externalReference?: string | null;
};

export type PaymentReturnConfirmation = {
  message?: string;
  paymentStatus?: string;
  status: 'idle' | 'checking' | 'confirmed' | 'error';
};

export type TestCardInput = {
  cardholderName: string;
  cardNumber: string;
  cvv: string;
  expiry: string;
  postalCode: string;
};
