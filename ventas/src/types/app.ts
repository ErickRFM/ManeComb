import type { OperationalState } from '@shared/operational-contract';

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

export type VehicleStatus = 'available' | 'assigned' | 'maintenance';

export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export type NavigationStop = GeoPoint & {
  id: string;
  address: string;
  order: number;
};

export type NavigationRouteOption = {
  label?: string;
  distanceMeters?: number;
  durationSeconds?: number;
  durationInTrafficSeconds?: number;
  trafficLevel?: 'low' | 'medium' | 'high' | string;
  polyline?: GeoPoint[];
};

export type AssignedRoute = {
  originLabel?: string;
  origin?: GeoPoint | null;
  destinationLabel?: string;
  destination?: GeoPoint | null;
  stops?: NavigationStop[];
  assignedAt?: string | null;
  provider?: 'mapbox' | 'system' | 'osrm' | 'valhalla' | string;
  route?: NavigationRouteOption | null;
  alternatives?: NavigationRouteOption[];
};

export type SavedRoute = {
  id: string;
  name: string;
  code: string;
  color?: string | null;
  origin: GeoPoint;
  destination: GeoPoint;
  originLabel?: string;
  destinationLabel?: string;
  stops: NavigationStop[];
  distanceMeters: number;
  durationSeconds: number;
  durationInTrafficSeconds?: number;
  polyline: GeoPoint[];
  createdAt?: string;
  updatedAt?: string;
};

export type ActiveRouteProgress = {
  checkpointCount: number;
  currentCheckpointIndex: number;
  distanceAlongRoute: number;
  distanceFromRoute: number;
  distanceRemaining: number;
  etaAt: string | null;
  heading?: number | null;
  isOffRoute: boolean;
  progressPercent: number;
  snappedLocation: GeoPoint | null;
  speedMetersPerSecond: number | null;
  timeRemainingSeconds: number;
  timestamp: string;
};

export type Vehicle = {
  id: string;
  organizationId?: string;
  code: string;
  plate: string;
  status: VehicleStatus | string;
  operationalState?: OperationalState | null;
  occupancy?: number;
  capacity?: number;
  delayMinutes?: number;
  currentKilometers?: number;
  fuel?: number;
  routeId?: string | null;
  driverId?: string | null;
  supervisorId?: string | null;
  driverName?: string;
  driver?: User | null;
  etaMinutes?: number | null;
  heading?: number | null;
  speed?: number | null;
  location?: GeoPoint | null;
  locationTimestamp?: string | null;
  gpsFreshness?: {
    state: 'fresh' | 'stale' | 'missing'; isFresh: boolean; thresholdMs: number;
    evaluatedAt: string; freshUntil: string | null;
  };
  activeRouteProgress?: ActiveRouteProgress | null;
  assignedRoute?: AssignedRoute | null;
  routeName?: string;
  routeCode?: string;
  routeColor?: string | null;
  updatedAt?: string | null;
};

export type VehicleMutationPayload = {
  code?: string;
  plate?: string;
  status?: VehicleStatus;
  currentKilometers?: number;
};

export type RouteAssignmentPayload = {
  vehicleId: string;
  routeId?: string;
  originLabel: string;
  destinationLabel: string;
  origin: GeoPoint;
  destination: GeoPoint;
};

export type RouteSessionStatus = 'ASSIGNED' | 'READY' | 'RUNNING' | 'PAUSED' | 'FINISHED' | 'CANCELLED';
export type RouteSessionProcessingStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type RouteEventType =
  | 'SESSION_STARTED'
  | 'SESSION_PAUSED'
  | 'SESSION_RESUMED'
  | 'SESSION_FINISHED'
  | 'GPS_LOST'
  | 'GPS_RECOVERED'
  | 'CHECKPOINT_REACHED'
  | 'OFF_ROUTE'
  | 'ON_ROUTE'
  | 'VEHICLE_STOPPED'
  | 'VEHICLE_MOVING';

export type RouteSessionComputedMetrics = {
  averageGpsAccuracy?: number | null;
  averageSpeed?: number | null;
  completedCheckpoints?: number;
  completedLaps?: number;
  compliancePercent?: number;
  effectiveTimePercent?: number;
  gpsCoveragePercent?: number;
  gpsQuality?: {
    badPercent: number;
    goodPercent: number;
    normalPercent: number;
    counts: {
      GOOD: number;
      NORMAL: number;
      BAD: number;
    };
  };
  incompleteLaps?: number;
  longestOffRouteSeconds?: number;
  longestStopSeconds?: number;
  maxSpeed?: number | null;
  minSpeed?: number | null;
  p95Speed?: number | null;
  positionCount?: number;
  stoppedSpeedThresholdMetersPerSecond?: number;
  totalDistance?: number | null;
  totalDuration?: number;
};

export type RouteSession = {
  id: string;
  organizationId: string;
  routeId: string;
  vehicleId: string;
  driverId: string;
  startedAt: string;
  finishedAt: string | null;
  status: RouteSessionStatus;
  createdAt: string;
  updatedAt: string;
  statisticsReady?: boolean;
  processingStatus?: RouteSessionProcessingStatus;
  processingCompletedAt?: string | null;
  processingError?: string | null;
  totalDistance?: number | null;
  totalDuration?: number | null;
  movingTime?: number | null;
  stoppedTime?: number | null;
  gpsLostTime?: number | null;
  offRouteTime?: number | null;
  checkpointCount?: number | null;
  completedCheckpoints?: number | null;
  completedLaps?: number | null;
  averageSpeed?: number | null;
  maxSpeed?: number | null;
  averageGpsAccuracy?: number | null;
  gpsLostEvents?: number | null;
  offRouteEvents?: number | null;
  stopEvents?: number | null;
  metrics?: RouteSessionComputedMetrics | null;
};

export type RouteSessionMetrics = Pick<
  RouteSession,
  | 'id'
  | 'status'
  | 'statisticsReady'
  | 'processingStatus'
  | 'processingError'
  | 'processingCompletedAt'
  | 'metrics'
  | 'totalDistance'
  | 'totalDuration'
  | 'movingTime'
  | 'stoppedTime'
  | 'gpsLostTime'
  | 'offRouteTime'
  | 'checkpointCount'
  | 'completedCheckpoints'
  | 'completedLaps'
  | 'averageSpeed'
  | 'maxSpeed'
  | 'averageGpsAccuracy'
  | 'gpsLostEvents'
  | 'offRouteEvents'
  | 'stopEvents'
> & {
  sessionId: string;
};

export type RouteSessionHistoryFilters = {
  vehicleId?: string;
  driverId?: string;
  routeId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: RouteSessionStatus;
  limit?: number;
  offset?: number;
};

export type PaginatedResult<T> = {
  items: T[];
  limit: number;
  offset: number;
  total: number;
};

export type RouteEvent = {
  id: string;
  organizationId?: string;
  sessionId: string;
  vehicleId: string;
  routeId: string;
  driverId: string;
  eventType: RouteEventType;
  timestamp: string;
  latitude?: number | null;
  longitude?: number | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
};

export type CheckpointVisit = {
  id: string;
  organizationId?: string;
  sessionId: string;
  checkpointId: string;
  timestamp: string;
  distance?: number | null;
  visitOrder: number;
  latitude?: number | null;
  longitude?: number | null;
  createdAt?: string;
};

export type RouteSessionPosition = {
  id: string;
  organizationId?: string;
  sessionId: string;
  vehicleId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  gpsQuality?: 'GOOD' | 'NORMAL' | 'BAD';
  createdAt?: string;
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
  isActive?: boolean;
  activeUnits: number;
  availableUnits: number;
  totalUnits: number;
  unitsLimit?: number;
  monthlyPrice?: number;
  currency?: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  nextBillingAt?: string | null;
  expiresAt?: string | null;
  cancelAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: string | null;
  financialStatus?: string | null;
  refundedAmountMinor?: number;
  refundableAmountMinor?: number;
  chargebackStatus?: string | null;
  serviceSuspendedReason?: string | null;
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
  sharedAt: string | null;
  sharedBy: string | null;
  shareCount: number;
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

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'in_progress' | 'resolved';

export type Incident = {
  id: string;
  title: string;
  type: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  routeId: string | null;
  vehicleId: string | null;
  reporterId: string;
  description: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    timestamp?: string | null;
  } | null;
  createdAt: string;
  media: string[];
  route?: unknown | null;
  vehicle?: { id: string; code: string } | null;
  reporter?: { id: string; name: string } | null;
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
  replacesDocumentId?: string | null;
  supersededByDocumentId?: string | null;
  version?: number;
  deletedAt?: string | null;
  deletedBy?: string | null;
  deleteReason?: string | null;
  owner?: { id: string; name?: string; code?: string } | null;
};

export type PortalAppVersion = {
  version: string;
  date: string;
  current: boolean;
  size: string;
  androidMin: string;
  notes: string[];
  archived?: boolean;
  mandatory?: boolean;
};

export type PortalAppInfo = {
  name: string;
  version: string;
  status?: string;
  apkUrl: string;
  androidMin: string;
  size: string;
  releaseDate: string;
  releaseNotes: string[];
  versionHistory?: PortalAppVersion[];
};
