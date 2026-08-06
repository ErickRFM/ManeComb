import { createPlatformApiClient, getPlatformTokenHeader } from '@/lib/platform-api-client';
import type { PlatformCapabilities, PlatformOverview } from './types';

const platformApi = createPlatformApiClient('/api/platform');

export async function platformCapabilitiesRequest(token: string) {
  const { data } = await platformApi.get('/capabilities', {
    headers: getPlatformTokenHeader(token),
  });
  return data.data as PlatformCapabilities;
}

export async function platformOverviewRequest(token: string) {
  const { data } = await platformApi.get('/overview', {
    headers: getPlatformTokenHeader(token),
  });
  return data.data as PlatformOverview;
}
