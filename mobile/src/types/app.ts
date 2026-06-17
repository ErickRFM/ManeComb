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
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'in_progress' | 'resolved';
export type ConnectionMode = 'online' | 'local';
export type ConversationKind = 'group' | 'direct';
export type ConversationChannelMode = 'chat' | 'radio';

export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
  phone?: string;
  companyName?: string;
  accountType?: AccountType;
  preferredMethod?: PaymentProfile['preferredMethod'];
  cardholderName?: string;
  cardBrand?: string;
  cardLast4?: string;
  cardExpMonth?: string;
  cardExpYear?: string;
  customerReference?: string;
};

export type CompanyProfile = {
  companyName: string;
  legalName: string;
  taxId: string;
  billingEmail: string;
  billingAddress: string;
};

export type PaymentProfile = {
  preferredMethod: 'card' | 'spei' | 'transfer';
  cardholderName: string;
  cardBrand: string;
  cardLast4: string;
  cardExpMonth: string;
  cardExpYear: string;
  customerReference: string;
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
  avatarUrl?: string | null;
  companyName?: string;
  legalName?: string;
  taxId?: string;
  billingEmail?: string;
  billingAddress?: string;
  preferredMethod?: PaymentProfile['preferredMethod'];
  cardholderName?: string;
  cardBrand?: string;
  cardLast4?: string;
  cardExpMonth?: string;
  cardExpYear?: string;
  customerReference?: string;
  e2eePublicKey?: string;
  e2eeKeyRotatedAt?: string;
  companyProfile?: Partial<CompanyProfile>;
  paymentProfile?: Partial<PaymentProfile>;
};

export type ProfileMutationPayload = {
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
  avatarUrl?: string | null;
  accountType?: AccountType;
  organizationId?: string;
  userStatus?: UserAccountStatus;
  companyName?: string;
  legalName?: string;
  taxId?: string;
  billingEmail?: string;
  billingAddress?: string;
  preferredMethod?: PaymentProfile['preferredMethod'];
  cardholderName?: string;
  cardBrand?: string;
  cardLast4?: string;
  cardExpMonth?: string;
  cardExpYear?: string;
  customerReference?: string;
  e2eePublicKey?: string;
  e2eeKeyRotatedAt?: string;
  companyProfile?: Partial<CompanyProfile>;
  paymentProfile?: Partial<PaymentProfile>;
};

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
  phone: string;
  shift: string;
  status: string;
  avatar: string;
  avatarUrl?: string | null;
  vehicleId: string | null;
  e2eePublicKey?: string;
  e2eeKeyRotatedAt?: string;
  companyProfile?: CompanyProfile;
  paymentProfile?: PaymentProfile;
};

export type UserAccountStatus = 'active' | 'pending' | 'suspended';

export type PortalSubscription = {
  id: string | null;
  planId: string | null;
  planName: string;
  status: string;
  isActive?: boolean;
  activeUnits: number;
  availableUnits: number;
  totalUnits: number;
  unitsLimit?: number;
  monthlyPrice?: number;
  currency?: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  expiresAt?: string | null;
  cancelAt?: string | null;
};

export type ActivationKeyStatus = 'available' | 'used' | 'expired' | 'revoked';

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
  status: ActivationKeyStatus;
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

export type DriverActivationValidation = {
  valid: boolean;
  keyId: string;
  companyId: string;
  companyName: string;
  planId: string;
  planName: string;
  expiresAt: string | null;
  availableDrivers: number;
};

export type DriverActivationRegisterPayload = {
  key: string;
  name: string;
  email?: string;
  phone?: string;
  password: string;
  unit?: {
    code?: string;
    vehicleCode?: string;
    plate?: string;
    routeId?: string;
    capacity?: number;
  };
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

export type AuthTenantContext = {
  id: string;
  organizationId?: string;
  companyId?: string;
  name?: string;
  status?: string;
  isOperational?: boolean;
};

export type PostLoginDestination =
  | 'Login'
  | 'HomeConductor'
  | 'PlanRequired'
  | 'PaymentPending'
  | 'PlanBlocked'
  | 'SyncError'
  | 'OperationalOnboarding'
  | 'HomeOperativo';

export type AuthRoutingContext = {
  canAccessMobile?: boolean;
  canUseOperations?: boolean;
  destination: PostLoginDestination;
  mobileBlockReason?: MobileBlockReason | null;
  onboarding?: PortalOnboarding | null;
  postLoginRoute?: string;
  reason?: string;
  route: string;
  source?: string | null;
  subscription?: PortalSubscription | null;
  tenant?: AuthTenantContext | null;
};

export type MobileBlockReason =
  | 'inactive_plan'
  | 'missing_tenant'
  | 'no_plan'
  | 'payment_pending'
  | 'sync_error';

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

export type E2eeBackupRecord = {
  deviceId: string;
  publicKey: string;
  backupCipher: string;
  backupVersion: string;
  platform: string;
  label?: string;
  updatedAt: string;
  restoredAt?: string | null;
};

export type RouteShape = {
  id: string;
  name: string;
  code: string;
  color: string;
  polyline: GeoPoint[];
};

export type NavigationPlaceResult = {
  id: string;
  label: string;
  address: string;
  location: GeoPoint;
};

export type NavigationRouteOption = {
  label: string;
  distanceMeters: number;
  durationSeconds: number;
  durationInTrafficSeconds: number;
  trafficLevel: 'low' | 'medium' | 'high';
  polyline: GeoPoint[];
};

export type NavigationPlan = {
  provider: 'google' | 'system';
  origin: GeoPoint;
  destination: GeoPoint;
  routes: NavigationRouteOption[];
  updatedAt?: string;
};

export type AssignedRoute = {
  originLabel: string;
  destinationLabel: string;
  destination: GeoPoint;
  assignedBy: string;
  assignedAt: string;
  provider: 'google' | 'system';
  route: NavigationRouteOption;
  alternatives: NavigationRouteOption[];
};

export type VehicleTripRecord = {
  id: string;
  vehicleId: string;
  vehicleCode: string;
  lap: number;
  serviceDate: string;
  originLabel: string;
  destinationLabel: string;
  origin: GeoPoint;
  destination: GeoPoint;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  distanceMeters: number;
  plannedDurationSeconds: number;
  provider: 'google' | 'system' | string;
  registeredBy: string;
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

export type CommercialAddOn = {
  code: string;
  name: string;
  price: number;
  included: boolean;
  description?: string;
};

export type CommercialCheckoutPayload = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  legalName?: string;
  billingEmail?: string;
  billingAddress?: string;
  taxId?: string;
  planId: string;
  paymentMethod: 'card' | 'spei' | 'transfer';
  needsOnboarding?: boolean;
  needsInvoice?: boolean;
  requestTrial?: boolean;
  trialDays?: number;
  selectedAddOns?: string[];
  notes?: string;
};

export type CommercialOnboardingItem = {
  id: string;
  title: string;
  owner: string;
  status: string;
  description?: string;
};

export type CommercialStarterFleetItem = {
  vehicleCode: string;
  label: string;
  status: string;
  suggestedDriver: string;
  suggestedShift: string;
};

export type CommercialMerchantProfile = {
  brandName: string;
  legalName: string;
  supportEmail?: string | null;
  supportPhone?: string | null;
  bankTransferEnabled: boolean;
  bankName?: string | null;
};

export type CommercialPaymentInstructions = {
  type: 'spei_transfer' | string;
  brandName: string;
  legalName: string;
  accountHolder: string;
  clabe: string;
  bankName?: string | null;
  amount: number;
  currency: string;
  reference: string;
  concept: string;
  supportEmail?: string | null;
  supportPhone?: string | null;
  summary: string;
};

export type CommercialInvoiceSummary = {
  status: 'ready' | 'trial' | 'pending_payment' | 'not_requested' | string;
  label: string;
  invoiceNumber: string;
  issuedAt?: string | null;
  needsInvoice: boolean;
  legalName: string;
  taxId: string;
  billingEmail: string;
  billingAddress: string;
  total: number;
  currency: string;
};

export type CommercialDownloadAsset = {
  code: 'activation-kit' | 'starter-fleet' | 'invoice-summary' | string;
  title: string;
  description: string;
  fileName: string;
  kind: 'html' | 'csv' | string;
  available: boolean;
  token?: string | null;
  urlPath?: string | null;
};

export type CommercialCheckoutResult = {
  id: string;
  referenceCode: string;
  ownerUserId?: string | null;
  ownerAccountEmail?: string;
  organizationSlug?: string;
  accountStatus?: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  billingProfile?: CompanyProfile;
  planId: string;
  planName: string;
  fleetSize: number;
  basePlanPrice?: number;
  addOns?: CommercialAddOn[];
  addOnsTotal?: number;
  radioFeatureEnabled?: boolean;
  totalPrice: number;
  pricePerVehicle: number;
  strategy: string;
  paymentMethod: string;
  paymentProvider: string;
  checkoutUrl?: string | null;
  paymentExternalReference?: string;
  paymentProviderReference?: string;
  paymentStatus: string;
  paymentApprovedAt?: string | null;
  status: string;
  source: string;
  needsOnboarding: boolean;
  needsInvoice: boolean;
  requestTrial?: boolean;
  trialDays?: number;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  trialStatus?: string;
  notes: string;
  activationStatus: string;
  activationStartedAt?: string | null;
  activatedAt?: string | null;
  activationNotes?: string;
  onboardingStatus?: string;
  onboardingChecklist?: CommercialOnboardingItem[];
  fleetSetupStatus?: string;
  starterFleet?: CommercialStarterFleetItem[];
  launchSummary?: string;
  lastEmailStatus?: string;
  lastWhatsappStatus?: string;
  lastContactedAt?: string | null;
  merchantProfile?: CommercialMerchantProfile;
  paymentInstructions?: CommercialPaymentInstructions | null;
  invoiceSummary?: CommercialInvoiceSummary;
  downloads?: CommercialDownloadAsset[];
  createdAt: string;
  nextStep: string;
};

export type Vehicle = {
  id: string;
  code: string;
  plate: string;
  routeId: string;
  driverId: string | null;
  supervisorId: string | null;
  status: string;
  occupancy: number;
  capacity: number;
  etaMinutes: number | null;
  delayMinutes: number;
  speed: number;
  fuel: number;
  updatedAt: string;
  location: GeoPoint;
  assignedRoute?: AssignedRoute | null;
  routeName?: string;
  routeCode?: string;
  routeColor?: string;
  driverName?: string;
  route?: RouteShape | null;
  driver?: User | null;
};

export type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  trend: string;
  tone: 'positive' | 'warning' | 'danger' | 'info';
};

export type DashboardAlert = {
  id: string;
  label: string;
  tone: string;
  subtitle: string;
  status: string;
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  level: string;
  category?: string;
  targetUserIds?: string[];
  targetRoles?: string[];
  data?: Record<string, unknown> | null;
  createdAt: string;
  readBy: string[];
  isRead?: boolean;
};

export type DashboardData = {
  hero: {
    eyebrow: string;
    title: string;
    description: string;
  };
  metrics: DashboardMetric[];
  fleet: Vehicle[];
  alerts: DashboardAlert[];
  notifications: NotificationItem[];
  shift: {
    label: string;
    startedAt: string;
    nextCheckpointInMinutes: number;
  };
};

export type Incident = {
  id: string;
  title: string;
  type: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  routeId: string;
  vehicleId: string | null;
  reporterId: string;
  description: string;
  createdAt: string;
  media: string[];
  route?: RouteShape | null;
  vehicle?: Vehicle | null;
  reporter?: User | null;
};

export type ConversationSummary = {
  id: string;
  title: string;
  kind: ConversationKind;
  channelMode: ConversationChannelMode;
  description?: string;
  encrypted?: boolean;
  participants: User[];
  lastMessage?: ChatMessage;
  unreadCount: number;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  kind?: 'text' | 'audio' | 'image' | 'video';
  text: string;
  textPreview?: string;
  audioUrl?: string | null;
  transcript?: string;
  durationSeconds?: number;
  mimeType?: string;
  e2eeEnvelope?: {
    version: string;
    nonce: string;
    ciphertext: string;
    recipientId: string;
    senderPublicKey?: string;
  } | null;
  encrypted?: boolean;
  createdAt: string;
  sender?: User | null;
  conversationId?: string;
};

export type ChatDirectoryContact = User & {
  directConversationId?: string | null;
  radioConversationId?: string | null;
};

export type DocumentItem = {
  id: string;
  ownerType: 'driver' | 'vehicle';
  ownerId: string;
  name: string;
  category: string;
  status: string;
  expiresAt: string;
  fileUrl?: string | null;
  storageType?: string;
  mimeType?: string;
  fileSize?: number;
  uploadedAt?: string;
  uploadedBy?: string;
  originalFileName?: string;
  storageKey?: string;
  reviewStatus?: 'approved' | 'rejected' | 'pending_review' | string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewNotes?: string;
  owner?: User | Vehicle | null;
};

export type DocumentReviewPayload = {
  reviewStatus: 'approved' | 'rejected' | 'pending_review';
  reviewNotes?: string;
};

export type RtcIceConfig = {
  iceServers: {
    urls: string | string[];
    username?: string;
    credential?: string;
  }[];
  turnEnabled: boolean;
  credentialMode?: 'stun_only' | 'static' | 'coturn_rest' | string;
  credentialExpiresAt?: string | null;
  realm?: string;
};

export type RtcSessionRecord = {
  id: string;
  roomId: string;
  initiatedBy?: string | null;
  participantUserIds: string[];
  participantNames: string[];
  startedAt: string;
  endedAt?: string | null;
  durationSeconds: number;
  status: string;
  sharedScreen: boolean;
  offerCount: number;
  lastEventAt?: string;
};

export type OperationalEventRecord = {
  id: string;
  type: string;
  scope: string;
  level: string;
  status: string;
  route?: string;
  method?: string;
  userId?: string | null;
  entityId?: string | null;
  message?: string;
  durationMs?: number;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type OperationalObservabilitySnapshot = {
  windowHours: number;
  apiErrors: number;
  slowRequests: number;
  pushDelivered: number;
  pushFailed: number;
  checkoutEvents: number;
  activeCriticalIncidents: number;
  rtc: {
    recentSessions: number;
    completedSessions: number;
    averageDurationSeconds: number;
  };
  recentEvents: OperationalEventRecord[];
};

export type LiveLocationsData = {
  updatedAt: string;
  center: {
    latitude: number;
    longitude: number;
  };
  routes: RouteShape[];
  vehicles: Vehicle[];
  incidents: Incident[];
};

export type LoginResult = {
  ok: boolean;
  token: string;
  tokenExpiresAt?: string | null;
  refreshToken?: string;
  refreshTokenExpiresAt?: string | null;
  session?: PortalSession;
  user: User;
  authContext?: AuthRoutingContext | null;
  canAccessMobile?: boolean;
  mobileBlockReason?: MobileBlockReason | null;
  onboarding?: PortalOnboarding | null;
  postLoginRoute?: string;
  subscription?: PortalSubscription | null;
  tenant?: AuthTenantContext | null;
  dashboard: DashboardData | null;
};

export type SessionResult = {
  ok: boolean;
  profile: {
    user: User;
    vehicle: Vehicle | null;
    documents: DocumentItem[];
  };
  authContext?: AuthRoutingContext | null;
  canAccessMobile?: boolean;
  mobileBlockReason?: MobileBlockReason | null;
  onboarding?: PortalOnboarding | null;
  postLoginRoute?: string;
  subscription?: PortalSubscription | null;
  tenant?: AuthTenantContext | null;
  dashboard: DashboardData | null;
};

export type IncidentDraft = {
  title: string;
  type: string;
  description: string;
  severity: IncidentSeverity;
};

export type FleetControlLog = {
  id: string;
  vehicleId: string;
  vehicleCode: string;
  driverName?: string;
  departureAt: string;
  arrivalAt?: string | null;
  status: 'active' | 'completed' | 'delayed';
  odometerDeparture?: number;
  odometerArrival?: number;
  notes?: string;
  fuelLevelDeparture?: number;
  fuelLevelArrival?: number;
};
