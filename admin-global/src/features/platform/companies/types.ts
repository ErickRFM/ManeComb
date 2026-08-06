export type PlatformCompanyPlan = {
  id: string | null;
  name: string;
  units: number;
  price: number;
  currency: 'MXN';
  radioIncluded: boolean;
} | null;

export type PlatformCompanyOwner = {
  id: string;
  name: string;
  email: string;
  status: string;
  lastAccessAt: string | null;
  createdAt: string | null;
} | null;

export type PlatformCompany = {
  organizationId: string;
  companyName: string;
  organizationSlug: string;
  createdAt: string | null;
  lastAccessAt: string | null;
  owner: PlatformCompanyOwner;
  plan: PlatformCompanyPlan;
  commercial: {
    orderId: string | null;
    accountStatus: string | null;
    status: string | null;
    paymentStatus: string | null;
    activationStatus: string | null;
    onboardingStatus: string | null;
    trialStatus: string | null;
    currentPeriodEnd: string | null;
    paidUntil: string | null;
    nextBillingAt: string | null;
    cancelAtPeriodEnd: boolean;
  };
  billing: {
    paymentMethod: string | null;
    provider: string | null;
    totalPrice: number;
    currency: 'MXN';
    financialStatus: string | null;
    refundableAmountMinor: number;
    chargebackStatus: string | null;
  };
  users: {
    total: number;
    byStatus: { active: number; pending: number; suspended: number };
    items?: Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      accountType: string;
      status: string;
      lastAccessAt: string | null;
      createdAt: string | null;
    }>;
    truncated?: boolean;
  };
  vehicles: {
    total: number;
    active: number;
    byStatus: { on_route: number; maintenance: number; idle: number; retired: number };
    items?: Array<{
      id: string;
      code: string;
      plate: string;
      status: string;
      driverId: string | null;
      routeId: string | null;
      retiredAt: string | null;
      updatedAt: string | null;
    }>;
    truncated?: boolean;
  };
  operationalStatus: 'operational' | 'attention' | 'inactive';
  commercialHistory?: {
    totalOrders: number;
    firstOrderAt: string | null;
    latestOrderAt: string | null;
  };
};

export type PlatformCompanyFilters = {
  search: string;
  planId: string | null;
  paymentStatus: string | null;
  onboardingStatus: string | null;
  sort: string;
  order: 'asc' | 'desc';
};

export type PlatformPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};
