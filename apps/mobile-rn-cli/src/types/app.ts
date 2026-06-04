export type Role = 'admin' | 'driver' | 'supervisor' | 'owner' | 'operator';

export type AccountType = 'operations' | 'company_owner';

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  accountType?: AccountType;
  organizationId?: string | null;
  accountStatus?: 'active' | 'pending' | 'suspended';
  subscriptionStatus?: 'active' | 'trial_active' | 'no_plan' | 'pending_payment' | 'expired' | 'past_due';
  onboardingStatus?: 'pending_plan' | 'pending_payment' | 'pending_onboarding' | 'active' | 'completed';
  companyProfile?: {
    companyName?: string;
    contactName?: string;
    phone?: string;
    billingEmail?: string;
  };
};

export type AuthResponse = {
  ok: boolean;
  token: string;
  refreshToken?: string;
  user: User;
  dashboard?: DashboardData;
  message?: string;
};

export type CommercialPlan = {
  id: string;
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  maxUnits?: number;
  features?: string[];
};

export type DashboardMetric = {
  label: string;
  value: string;
  trend?: string;
  tone?: string;
};

export type Vehicle = {
  id: string;
  code?: string;
  name?: string;
  status?: string;
  driverName?: string;
  routeName?: string;
};

export type Incident = {
  id: string;
  title?: string;
  description?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  status?: 'open' | 'in_progress' | 'resolved';
  createdAt?: string;
};

export type DashboardData = {
  metrics?: DashboardMetric[];
  fleet?: Vehicle[];
  vehicles?: Vehicle[];
  incidents?: Incident[];
  alerts?: Array<{ id: string; title?: string; message?: string; severity?: string }>;
};

export type LocationPoint = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
};

export type ActivationPayload = {
  key: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
};

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
  companyName?: string;
  phone?: string;
};
