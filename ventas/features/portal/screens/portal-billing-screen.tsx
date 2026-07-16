import { Linking, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { EmptyState } from '@/src/components/ui/empty-state';
import { SkeletonBlock } from '@/src/components/ui/skeleton';
import { resolveInvoiceDownloadUrl } from '@/features/commercial';
import { InvoiceList, PortalSectionCard } from '../components/portal-cards';
import { PortalLayout } from '../components/portal-layout';
import { usePortalStore } from '../store/use-portal-store';

export function PortalBillingScreen() {
  const { invoices, isLoading } = usePortalStore(
    useShallow((state) => ({
      invoices: state.invoices,
      isLoading: state.isLoading,
    }))
  );

  return (
    <PortalLayout title="Facturación" subtitle="Consulta y descarga los comprobantes disponibles de tu cuenta.">
      <PortalSectionCard
        title="Historial de facturas"
        subtitle={invoices.length ? `${invoices.length} ${invoices.length === 1 ? 'registro' : 'registros'}` : undefined}>
        {isLoading ? (
          <View style={{ gap: 10 }}>
            <SkeletonBlock height={80} />
            <SkeletonBlock height={80} />
          </View>
        ) : invoices.length ? (
          <InvoiceList invoices={invoices} onDownload={(invoice) => void Linking.openURL(resolveInvoiceDownloadUrl(invoice))} />
        ) : (
          <EmptyState
            icon="file-document-outline"
            title="No existen facturas todavía"
            description="Tus facturas aparecerán aquí después de confirmar el primer cobro."
          />
        )}
      </PortalSectionCard>
    </PortalLayout>
  );
}
