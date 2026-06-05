export type Role =
  | 'owner'
  | 'admin'
  | 'dispatcher'
  | 'supervisor'
  | 'billing_manager'
  | 'support'
  | 'viewer'
  | 'driver';

export type AccountType = 'operations' | 'company_owner';
export type ConnectionMode = 'online' | 'local';
export type UserAccountStatus = 'active' | 'pending' | 'suspended';

export type CompanyProfile = {
  companyName?: string;
  legalName?: string;
  taxId?: string;
  billingEmail?: string;
  billingAddress?: string;
};

export type PaymentProfile = {
  preferredMethod?: 'card' | 'spei' | 'transfer';
  cardholderName?: string;
  cardBrand?: string;
  cardLast4?: string;
  cardExpMonth?: string;
  cardExpYear?: string;
  customerReference?: string;
};

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
  phone?: string;
  companyName?: string;
  accountType?: AccountType;
  customerReference?: string;
};

export type UserMutationPayload = {
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
  role?: Role;
  accountType?: AccountType;
  organizationId?: string;
  userStatus?: UserAccountStatus;
  status?: string;
  shift?: string;
  vehicleId?: string | null;
  companyName?: string;
  legalName?: string;
  taxId?: string;
  billingEmail?: string;
  billingAddress?: string;
  preferredMethod?: PaymentProfile['preferredMethod'];
};

export type ProfileMutationPayload = UserMutationPayload;

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  accountType: AccountType;
  organizationId?: string;
  userStatus?: UserAccountStatus;
  lastAccessAt?: string | null;
  invitedAt?: string | null;
  suspendedAt?: string | null;
  phone?: string;
  shift?: string;
  status?: string;
  avatar?: string;
  avatarUrl?: string | null;
  vehicleId?: string | null;
  companyProfile?: CompanyProfile;
  paymentProfile?: PaymentProfile;
};

export type CommercialPlan = {
  id: string;
  name: string;
  units: number;
  price: number;
  pricePerVehicle: number;
  strategy: string;
  badge: string;
  accent: 'info' | 'success' | 'warning' | 'danger';
  subtitle?: string;
  trialDays?: number;
  trialEligible?: boolean;
  includesRadioModule?: boolean;
  radioAddonEligible?: boolean;
  radioAddonPrice?: number;
};

export type CommercialCheckoutResult = {
  id: string;
  referenceCode: string;
  companyName: string;
  planId: string;
  planName: string;
  totalPrice: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
};

export type PortalSubscription = {
  id: string | null;
  planId: string | null;
  planName: string;
  status: string;
  activeUnits: number;
  availableUnits: number;
  totalUnits: number;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAt?: string | null;
};

export type PortalActivationKeyDriver = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  vehicleId?: string | null;
  status?: string;
};

export type PortalActivationKey = {
  id: string;
  key: string;
  companyId: string;
  adminId: string;
  planId: string;
  orderId?: string | null;
  status: string;
  usedByDriverId?: string | null;
  driver?: PortalActivationKeyDriver | null;
  expiresAt: string | null;
  usedAt: string | null;
  createdAt: string | null;
};

export type PortalActivationKeysSummary = {
  planId: string | null;
  planName: string;
  planStatus: string;
  paidUntil?: string | null;
  maxUnits: number;
  maxDrivers: number;
  activeUnits: number;
  activeDrivers: number;
  keysGenerated: number;
  keysAvailable: number;
  keysUsed: number;
  keysExpired: number;
  keysRevoked: number;
  availableSlots: number;
  remainingDriverSlots: number;
};

export type PortalActivationKeysResponse = {
  summary: PortalActivationKeysSummary;
  keys: PortalActivationKey[];
  activationKey?: PortalActivationKey;
};

export type PortalActivationEvent = {
  id: string;
  title: string;
  status: 'completed' | 'pending' | string;
  at?: string | null;
  description?: string;
};

export type PortalOnboardingStep = {
  id: string;
  title: string;
  status: 'completed' | 'pending' | string;
  description?: string;
};

export type PortalOnboarding = {
  status: 'completed' | 'pending' | string;
  steps: PortalOnboardingStep[];
};

export type PortalOverview = {
  organization: {
    id: string;
    name: string;
    taxId?: string;
    fleetSize: number;
    status: string;
  };
  account: {
    id: string;
    name: string;
    email: string;
    role: Role;
    accountType: AccountType;
    userStatus: string;
    lastAccessAt?: string | null;
  };
  subscription: PortalSubscription;
  metrics: {
    activeUsers: number;
    pendingUsers: number;
    suspendedUsers: number;
    activeUnits: number;
    availableUnits: number;
  };
  activationTimeline: PortalActivationEvent[];
  onboarding: PortalOnboarding;
  latestOrder?: CommercialCheckoutResult | null;
};

export type PortalInvoice = {
  id: string;
  orderId: string;
  referenceCode: string;
  label: string;
  status: string;
  total: number;
  currency: string;
  issuedAt?: string | null;
  downloadUrl?: string | null;
};

export type PortalPaymentMethod = {
  id: string;
  provider: string;
  type: 'card' | 'spei' | string;
  brand: string;
  last4: string;
  expMonth?: string;
  expYear?: string;
  isDefault: boolean;
};

export type PortalSession = {
  id: string;
  userId?: string;
  organizationId?: string;
  ip?: string;
  userAgent?: string;
  platform?: string;
  locationApprox?: string;
  deviceName: string;
  createdAt?: string | null;
  lastSeenAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  revokedReason?: string;
  isActive?: boolean;
  current: boolean;
};
