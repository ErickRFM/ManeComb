import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { API_ORIGIN } from '@/src/api/client';
import { EmptyState } from '@/src/components/ui/empty-state';
import { InvoiceList, PortalSectionCard } from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { usePortalStore } from '../store/use-portal-store';
import type { PortalInvoice } from '@/src/types/app';

function resolveDownloadUrl(invoice: PortalInvoice) {
  const path = invoice.downloadUrl || `/api/account/invoices/${encodeURIComponent(invoice.id)}/download`;

  return /^https?:\/\//i.test(path) ? path : `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

export function PortalBillingScreen() {
  const { invoices, loadBilling } = usePortalStore(
    useShallow((state) => ({
      invoices: state.invoices,
      loadBilling: state.loadBilling,
    }))
  );

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  return (
    <PortalLayout title="Facturacion" subtitle="Historial fiscal y descargas asociadas a la cuenta.">
      <PortalSectionCard title="Historial de facturas" subtitle={`${invoices.length} registros`}>
        {invoices.length ? (
          <InvoiceList invoices={invoices} onDownload={(invoice) => void Linking.openURL(resolveDownloadUrl(invoice))} />
        ) : (
          <EmptyState
            icon="file-document-outline"
            title="Sin facturas"
            description="Las facturas apareceran cuando exista una orden comercial confirmada."
          />
        )}
      </PortalSectionCard>
    </PortalLayout>
  );
}
