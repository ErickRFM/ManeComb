import { Linking } from 'react-native';
import { readRuntimeValue } from '@/src/config/api_config';

export const SALES_PORTAL_URL =
  readRuntimeValue('MANECOMB_SALES_PORTAL_URL', 'SALES_PORTAL_URL') ||
  'https://manecomb1.pages.dev';

function buildSalesPortalUrl(path = '') {
  const base = SALES_PORTAL_URL.replace(/\/+$/, '');
  const suffix = path ? `/${path.replace(/^\/+/, '')}` : '';

  return `${base}${suffix}`;
}

export function openSalesPortal(path = '') {
  return Linking.openURL(buildSalesPortalUrl(path));
}
