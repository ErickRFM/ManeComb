import { createPlatformApiClient, getPlatformTokenHeader } from '@/lib/platform-api-client';
import type {
  PlatformAuditEntry,
  PlatformCommercialOrder,
  PlatformDeviceVersionStats,
  PlatformOperationalInsights,
  PlatformOperationList,
  PlatformSystemReadiness,
} from './types';

const platformApi = createPlatformApiClient('/api/platform');

function buildQuery(params: Record<string, string | number | null | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && String(value).trim()) query.set(key, String(value));
  }
  return query.toString() ? `?${query.toString()}` : '';
}

export async function platformCommercialOrdersRequest(
  token: string,
  params: Record<string, string | number | null | undefined> = {}
) {
  const { data } = await platformApi.get(`/commercial/orders${buildQuery(params)}`, {
    headers: getPlatformTokenHeader(token),
  });
  return {
    items: data.data,
    pagination: data.pagination,
    filters: data.filters,
  } as PlatformOperationList<PlatformCommercialOrder>;
}

export async function platformCommercialOrderRequest(token: string, orderId: string) {
  const { data } = await platformApi.get(`/commercial/orders/${encodeURIComponent(orderId)}`, {
    headers: getPlatformTokenHeader(token),
  });
  return data.data as PlatformCommercialOrder;
}

export async function platformSystemReadinessRequest(token: string) {
  const { data } = await platformApi.get('/system/readiness', {
    headers: getPlatformTokenHeader(token),
  });
  return data.data as PlatformSystemReadiness;
}

export async function platformSystemObservabilityRequest(token: string) {
  const { data } = await platformApi.get('/system/observability?hours=24&limit=10', {
    headers: getPlatformTokenHeader(token),
  });
  return data.data as PlatformOperationalInsights;
}

export async function platformDeviceVersionStatsRequest(token: string) {
  const { data } = await platformApi.get('/system/app/device-stats', {
    headers: getPlatformTokenHeader(token),
  });
  return data.data as PlatformDeviceVersionStats;
}

export async function platformAuditRequest(
  token: string,
  params: Record<string, string | number | null | undefined> = {}
) {
  const { data } = await platformApi.get(`/audit${buildQuery(params)}`, {
    headers: getPlatformTokenHeader(token),
  });
  return {
    items: data.data,
    pagination: data.pagination,
    filters: data.filters,
    persistent: Boolean(data.persistent),
  } as PlatformOperationList<PlatformAuditEntry> & { persistent: boolean };
}
