import { API_ORIGIN } from '@/src/api/client';
import type { PortalInvoice } from '@/src/types/app';

export function resolveInvoiceDownloadUrl(invoice: PortalInvoice) {
  const path = invoice.downloadUrl || `/api/account/invoices/${encodeURIComponent(invoice.id)}/download`;
  return /^https?:\/\//i.test(path) ? path : `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}
