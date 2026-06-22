import { Linking } from 'react-native';
import { readRuntimeValue } from '@/src/config/api_config';
import type { MobileBlockReason } from '@/src/types/app';

export const SALES_PORTAL_URL =
  readRuntimeValue('MANECOMB_SALES_PORTAL_URL', 'SALES_PORTAL_URL') ||
  'https://manecomb1.pages.dev';

function buildSalesPortalUrl(path = '') {
  const base = SALES_PORTAL_URL.replace(/\/+$/, '');
  const suffix = path ? `/${path.replace(/^\/+/, '')}` : '';

  return `${base}${suffix}`;
}

export function getSalesPortalPathForBlockReason(reason: MobileBlockReason | string) {
  if (reason === 'payment_pending') {
    return '/portal/pagos';
  }

  if (reason === 'inactive_plan') {
    return '/portal/plan';
  }

  if (reason === 'missing_tenant') {
    return '/portal/onboarding';
  }

  return '/ventas/';
}

export function openSalesPortal(path = '') {
  return Linking.openURL(buildSalesPortalUrl(path));
}
