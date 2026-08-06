import { createPlatformApiClient, getPlatformTokenHeader } from '@/lib/platform-api-client';
import type {
  GovernanceActionPayload,
  GovernanceActionResult,
  GovernanceList,
  PlatformGovernanceSession,
  PlatformInternalUser,
} from './types';

const platformApi = createPlatformApiClient('/api/platform');

function queryString(params: Record<string, string | number | boolean | null | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && String(value).trim()) query.set(key, String(value));
  }
  return query.toString() ? `?${query.toString()}` : '';
}

export async function platformTeamRequest(
  token: string,
  params: Record<string, string | number | boolean | null | undefined> = {}
) {
  const { data } = await platformApi.get(`/team${queryString(params)}`, {
    headers: getPlatformTokenHeader(token),
  });
  return {
    items: data.data,
    pagination: data.pagination,
    filters: data.filters,
  } as GovernanceList<PlatformInternalUser>;
}

export async function createPlatformTeamUserRequest(
  token: string,
  payload: { name: string; email: string; password: string; role: string }
) {
  const { data } = await platformApi.post('/team', payload, {
    headers: getPlatformTokenHeader(token),
  });
  return data.data as PlatformInternalUser;
}

export async function platformSessionsRequest(
  token: string,
  params: Record<string, string | number | boolean | null | undefined> = {}
) {
  const { data } = await platformApi.get(`/sessions${queryString(params)}`, {
    headers: getPlatformTokenHeader(token),
  });
  return {
    items: data.data,
    pagination: data.pagination,
    filters: data.filters,
  } as GovernanceList<PlatformGovernanceSession>;
}

export async function platformGovernanceActionRequest(
  token: string,
  idempotencyKey: string,
  payload: GovernanceActionPayload
) {
  const { data } = await platformApi.post('/actions', payload, {
    headers: {
      ...getPlatformTokenHeader(token),
      'Idempotency-Key': idempotencyKey,
    },
  });
  return data.data as GovernanceActionResult;
}
