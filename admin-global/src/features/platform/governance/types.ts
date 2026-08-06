import type { PlatformPagination } from '../companies/types';

export type PlatformInternalUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'suspended' | 'disabled';
  createdAt: string | null;
  updatedAt: string | null;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  lockedUntil: string | null;
  createdBy: string | null;
  suspendedAt: string | null;
  suspendedReason: string;
  mfaEnabled: boolean;
  mfaEnrollmentRequired: boolean;
  mfaSetupCompletedAt: string | null;
};

export type PlatformGovernanceSession = {
  id: string;
  userId: string;
  user: Pick<PlatformInternalUser, 'id' | 'name' | 'email' | 'role' | 'status'> | null;
  platform: string;
  deviceName: string;
  createdAt: string | null;
  lastSeenAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedReason: string;
  isActive: boolean;
  mfaVerified: boolean;
  current: boolean;
};

export type GovernanceActionType =
  | 'platform.user.suspend'
  | 'platform.user.reactivate'
  | 'platform.user.role.change'
  | 'platform.session.revoke'
  | 'platform.sessions.revoke_all';

export type GovernanceActionPayload = {
  action: GovernanceActionType;
  targetId: string;
  reason: string;
  confirmation: string;
  nextRole?: string | null;
};

export type GovernanceActionResult = {
  id: string;
  action: GovernanceActionType;
  target: PlatformInternalUser | PlatformGovernanceSession | null;
  revokedCount: number;
  replayed: boolean;
};

export type GovernanceList<T> = {
  items: T[];
  pagination: PlatformPagination;
  filters: Record<string, unknown>;
};
