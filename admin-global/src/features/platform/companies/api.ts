import { createPlatformApiClient, getPlatformTokenHeader } from '@/lib/platform-api-client';
import type { PlatformCompany, PlatformCompanyFilters, PlatformPagination } from './types';

const platformCompaniesApi = createPlatformApiClient('/api/platform/companies');

export type CompanyListRequest = {
  page?: number;
  limit?: number;
  search?: string;
  planId?: string | null;
  paymentStatus?: string | null;
  onboardingStatus?: string | null;
  sort?: string;
  order?: 'asc' | 'desc';
};

export async function platformCompaniesRequest(token: string, request: CompanyListRequest = {}) {
  const params = new URLSearchParams();
  if (request.page) params.set('page', String(request.page));
  if (request.limit) params.set('limit', String(request.limit));
  if (request.search?.trim()) params.set('search', request.search.trim());
  if (request.planId) params.set('planId', request.planId);
  if (request.paymentStatus) params.set('paymentStatus', request.paymentStatus);
  if (request.onboardingStatus) params.set('onboardingStatus', request.onboardingStatus);
  if (request.sort) params.set('sort', request.sort);
  if (request.order) params.set('order', request.order);

  const suffix = params.toString() ? `?${params.toString()}` : '';
  const { data } = await platformCompaniesApi.get(suffix, {
    headers: getPlatformTokenHeader(token),
  });

  return {
    items: data.data as PlatformCompany[],
    pagination: data.pagination as PlatformPagination,
    filters: data.filters as PlatformCompanyFilters,
  };
}

export async function platformCompanyRequest(token: string, organizationId: string) {
  const { data } = await platformCompaniesApi.get(`/${encodeURIComponent(organizationId)}`, {
    headers: getPlatformTokenHeader(token),
  });
  return data.data as PlatformCompany;
}
