import { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { isAxiosError } from 'axios';
import { useShallow } from 'zustand/react/shallow';
import { EmptyState } from '@/src/components/ui/empty-state';
import { SkeletonBlock } from '@/src/components/ui/skeleton';
import { resolveInvoiceDownloadUrl } from '@/features/commercial';
import { apiClient, getApiErrorMessage } from '@/src/api/client';
import type { PortalInvoice } from '@/src/types/app';
import { AppTheme, palette, Typography } from '@/constants/theme';
import { InvoiceList, PortalSectionCard } from '../cards';
import { PortalLayout } from '../components/portal-layout';
import { usePortalStore } from '../store/use-portal-store';

export function PortalBillingScreen() {
  const [message, setMessage] = useState<string | null>(null);
  const { invoices, isLoading } = usePortalStore(
    useShallow((state) => ({
      invoices: state.invoices,
      isLoading: state.isLoading,
    }))
  );

  const downloadInvoice = async (invoice: PortalInvoice) => {
    const url = resolveInvoiceDownloadUrl(invoice);
    setMessage(null);

    try {
      if (Platform.OS !== 'web' || typeof document === 'undefined') {
        await Linking.openURL(url);
        return;
      }

      const response = await apiClient.get<Blob>(url, { responseType: 'blob' });
      const objectUrl = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${invoice.referenceCode || invoice.id || 'factura'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setMessage(
        isAxiosError(error) && error.response
          ? getApiErrorMessage(error, 'El servidor no pudo entregar la factura.')
          : 'No se pudo abrir el enlace de descarga. Intenta nuevamente.'
      );
    }
  };

  return (
    <PortalLayout title="Facturación" subtitle="Consulta y descarga los comprobantes disponibles de tu cuenta.">
      <PortalSectionCard
        title="Historial de facturas"
        subtitle={invoices.length ? `${invoices.length} ${invoices.length === 1 ? 'registro' : 'registros'}` : undefined}>
        {message ? (
          <View style={styles.errorNotice}>
            <Text style={styles.errorText}>{message}</Text>
          </View>
        ) : null}
        {isLoading ? (
          <View style={{ gap: 10 }}>
            <SkeletonBlock height={80} />
            <SkeletonBlock height={80} />
          </View>
        ) : invoices.length ? (
          <InvoiceList invoices={invoices} onDownload={(invoice) => { void downloadInvoice(invoice); }} />
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

const styles = StyleSheet.create({
  errorNotice: {
    backgroundColor: palette.dangerSoft,
    borderColor: palette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    padding: AppTheme.spacing.md,
  },
  errorText: {
    color: palette.danger,
    fontFamily: Typography.body,
  },
});
