import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { AppCard } from '@/src/components/app-card';
import { StatusBadge, type StatusBadgeTone } from '@/src/components/ui/status-badge';
import { portalGlass, portalPalette } from '../portal-theme';
import type {
  PortalActivationEvent,
  PortalInvoice,
} from '@/src/types/app';

const portalColors = {
  ...portalPalette,
  surfaceAlt: portalPalette.surfaceSoft,
  card: portalPalette.surface,
};

type SummaryCardProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  detail?: string;
  tone?: StatusBadgeTone;
};

function getStatusTone(status?: string): StatusBadgeTone {
  const normalized = String(status || '').toLowerCase();

  if (['active', 'completed', 'finished', 'paid', 'ready', 'ready_for_activation', 'running', 'trial'].includes(normalized)) {
    return 'positive';
  }

  if (['paused', 'pending', 'pending_payment', 'trial_active'].includes(normalized)) {
    return 'warning';
  }

  if (['cancelled', 'canceled', 'suspended', 'failed', 'error'].includes(normalized)) {
    return 'danger';
  }

  return 'neutral';
}

export function formatPortalStatus(status?: string) {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'completed') return 'Completado';
  if (normalized === 'running') return 'En curso';
  if (normalized === 'paused') return 'Pausada';
  if (normalized === 'finished') return 'Finalizada';
  if (normalized === 'pending') return 'Pendiente';
  if (normalized === 'active') return 'Activo';
  if (normalized === 'inactive') return 'Inactivo';
  if (normalized === 'paid') return 'Pagado';
  if (normalized === 'ready') return 'Listo';
  if (normalized === 'ready_for_activation') return 'Listo para activar';
  if (normalized === 'trial' || normalized === 'trial_active') return 'Prueba activa';
  if (normalized === 'pending_payment') return 'Pago pendiente';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'Cancelado';
  if (normalized === 'suspended') return 'Suspendido';
  if (normalized === 'failed') return 'Fallido';

  const fallback = String(status || 'Sin estado').replace(/_/g, ' ');
  return fallback.charAt(0).toUpperCase() + fallback.slice(1);
}

export function PortalSectionCard({
  children,
  title,
  subtitle,
  right,
}: PropsWithChildren<{ title: string; subtitle?: string; right?: ReactNode }>) {
  const theme = { colors: portalColors };

  return (
    <AppCard style={[styles.sectionCard, { borderColor: portalPalette.line }, portalGlass()]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleWrap}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.sectionSubtitle, { color: theme.colors.muted }]}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.sectionRight}>{right}</View> : null}
      </View>
      {children}
    </AppCard>
  );
}

export function AccountSummaryCard({ icon, label, value, detail, tone = 'info' }: SummaryCardProps) {
  const theme = { colors: portalColors };

  return (
    <AppCard style={[styles.summaryCard, { backgroundColor: portalPalette.surfaceStrong, borderColor: portalPalette.line }]}>
      <View style={styles.summaryTop}>
        <View style={[styles.summaryIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
          <MaterialCommunityIcons name={icon} size={20} color={theme.colors.accent} />
        </View>
        <StatusBadge label={label} tone={tone} />
      </View>
      <Text style={[styles.summaryValue, { color: theme.colors.text }]} numberOfLines={2}>
        {value}
      </Text>
      {detail ? <Text style={[styles.summaryDetail, { color: theme.colors.muted }]}>{detail}</Text> : null}
    </AppCard>
  );
}

export function ActivationTimeline({ events }: { events: PortalActivationEvent[] }) {
  const theme = { colors: portalColors };

  return (
    <View style={styles.timeline}>
      {events.map((event) => {
        const done = event.status === 'completed';

        return (
          <View key={event.id} style={styles.timelineItem}>
            <View
              style={[
                styles.timelineDot,
                {
                  backgroundColor: done ? theme.colors.success : theme.colors.surfaceAlt,
                  borderColor: done ? theme.colors.success : theme.colors.line,
                },
              ]}>
              <MaterialCommunityIcons
                name={done ? 'check' : 'clock-outline'}
                size={14}
                color={done ? '#FFFFFF' : theme.colors.muted}
              />
            </View>
            <View style={styles.timelineContent}>
              <View style={styles.sectionHeader}>
          <Text style={[styles.itemTitle, { color: theme.colors.text }]} numberOfLines={2}>{event.title}</Text>
                <StatusBadge label={formatPortalStatus(event.status)} tone={getStatusTone(event.status)} />
              </View>
              {event.description ? <Text style={[styles.itemDescription, { color: theme.colors.muted }]} numberOfLines={3}>{event.description}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function InvoiceList({ invoices, onDownload }: { invoices: PortalInvoice[]; onDownload?: (invoice: PortalInvoice) => void }) {
  const theme = { colors: portalColors };

  return (
    <View style={styles.list}>
      {invoices.map((invoice) => (
        <View key={invoice.id} style={[styles.listItem, { borderColor: theme.colors.line, backgroundColor: theme.colors.surface }]}>
          <View style={[styles.summaryIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
            <MaterialCommunityIcons name="file-document-outline" size={21} color={theme.colors.accent} />
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
              style={[styles.smallButton, { backgroundColor: theme.colors.surfaceAlt }]}>
              <MaterialCommunityIcons name="download-outline" size={18} color={theme.colors.text} />
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

export function getPortalStatusTone(status?: string) {
  return getStatusTone(status);
}

const styles = StyleSheet.create({
  sectionCard: {
    borderRadius: AppTheme.radius.sm,
    gap: 10,
    minWidth: 0,
  },
  sectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  sectionTitleWrap: {
    flex: 1,
    flexBasis: 220,
    minWidth: 0,
  },
  sectionRight: {
    alignItems: 'flex-start',
    flexShrink: 0,
    maxWidth: '100%',
  },
  sectionTitle: {
    fontFamily: Typography.display,
    fontSize: 17,
    fontWeight: '900',
  },
  sectionSubtitle: {
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  summaryCard: {
    borderRadius: AppTheme.radius.sm,
    flex: 1,
    flexBasis: 150,
    minHeight: 70,
    minWidth: 0,
    padding: 10,
  },
  summaryTop: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'space-between',
  },
  summaryIcon: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    flexShrink: 0,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  summaryValue: {
    fontFamily: Typography.display,
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 22,
    minWidth: 0,
  },
  summaryDetail: {
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 17,
    minWidth: 0,
  },
  timeline: {
    gap: 12,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 12,
  },
  timelineDot: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    marginTop: 2,
    width: 28,
  },
  timelineContent: {
    flex: 1,
    gap: 4,
    minWidth: 0,
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
  list: {
    gap: 10,
  },
  listItem: {
    alignItems: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    minWidth: 0,
    padding: 12,
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
    gap: 8,
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
});
