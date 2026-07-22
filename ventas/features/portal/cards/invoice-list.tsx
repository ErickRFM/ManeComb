import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { portalPalette } from '../portal-theme';
import { transition } from '@/src/native/motion';
import type { PortalInvoice } from '@/src/types/app';
import { formatPortalStatus } from './format-portal-status';
import { getStatusTone } from './get-portal-status-tone';

export function InvoiceList({ invoices, onDownload }: { invoices: PortalInvoice[]; onDownload?: (invoice: PortalInvoice) => void }) {
  const theme = { colors: portalPalette };

  return (
    <View style={styles.list}>
      {invoices.map((invoice) => (
        <View key={invoice.id} style={[styles.listItem, { borderColor: portalPalette.line, backgroundColor: portalPalette.surface }]}>
          
          <View style={[styles.summaryIcon, { backgroundColor: portalPalette.surfaceSoft }]}>
            <MaterialCommunityIcons name="file-document-outline" size={21} color={portalPalette.accent} />
          </View>
          <View style={styles.listBody}>
            <Text style={[styles.itemTitle, { color: theme.colors.text }]} numberOfLines={1}>{invoice.label || 'Factura'}</Text>
            <Text style={[styles.itemDescription, { color: theme.colors.muted }]} numberOfLines={2}>
              {[invoice.referenceCode, `$${Number(invoice.total || 0).toLocaleString('es-MX')} ${invoice.currency}`, invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString('es-MX') : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={styles.statusActionGroup}>
            <StatusBadge label={formatPortalStatus(invoice.status)} tone={getStatusTone(invoice.status)} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Descargar factura ${invoice.referenceCode || ''}`.trim()}
              onPress={() => onDownload?.(invoice)}
              style={({ hovered, pressed }: any) => [
                styles.smallButton,
                { backgroundColor: portalPalette.surfaceSoft },
                transition('background-color, transform, opacity', 150),
                hovered ? { backgroundColor: portalPalette.accentSoft } : undefined,
                pressed ? { opacity: 0.7, transform: [{ scale: 0.92 }] } : undefined,
              ]}>
              <MaterialCommunityIcons name="download-outline" size={18} color={theme.colors.text} />
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  listItem: {
    alignItems: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    minWidth: 0,
    padding: 12,
  },
  summaryIcon: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    flexShrink: 0,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  listBody: {
    flex: 1,
    flexBasis: 190,
    minWidth: 0,
  },
  statusActionGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
    maxWidth: '100%',
  },
  smallButton: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    flexShrink: 0,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  itemTitle: {
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
    minWidth: 0,
  },
  itemDescription: {
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
    minWidth: 0,
  },
});
