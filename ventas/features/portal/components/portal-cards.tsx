import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { AppCard } from '@/src/components/app-card';
import { StatusBadge, type StatusBadgeTone } from '@/src/components/ui/status-badge';
import { SkeletonBlock } from '@/src/components/ui/skeleton';
import { portalGlass, portalPalette } from '../portal-theme';
import type {
  PortalActivationEvent,
  PortalInvoice,
  PortalOnboardingStep,
  PortalPaymentMethod,
  PortalSubscription,
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
  if (['active', 'completed', 'paid', 'ready', 'ready_for_activation', 'trial'].includes(String(status || ''))) {
    return 'positive';
  }

  if (['pending', 'pending_payment', 'trial_active'].includes(String(status || ''))) {
    return 'warning';
  }

  if (['cancelled', 'canceled', 'suspended', 'failed', 'error'].includes(String(status || ''))) {
    return 'danger';
  }

  return 'neutral';
}

export function formatPortalStatus(status?: string) {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'completed') return 'completado';
  if (normalized === 'pending') return 'pendiente';
  if (normalized === 'active') return 'activo';
  if (normalized === 'inactive') return 'inactivo';
  if (normalized === 'paid') return 'pagado';
  if (normalized === 'ready') return 'listo';
  if (normalized === 'ready_for_activation') return 'listo para activar';
  if (normalized === 'trial' || normalized === 'trial_active') return 'trial activo';
  if (normalized === 'pending_payment') return 'pago pendiente';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelado';
  if (normalized === 'suspended') return 'suspendido';
  if (normalized === 'failed') return 'fallido';

  return String(status || 'sin estado').replaceAll('_', ' ');
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

export function PlanStatusCard({ subscription }: { subscription: PortalSubscription | null }) {
  const theme = { colors: portalColors };

  if (!subscription) {
    return (
      <AppCard style={[styles.summaryCard, { backgroundColor: portalPalette.surfaceStrong, borderColor: portalPalette.line }]}>
        <SkeletonBlock height={18} width="55%" />
        <SkeletonBlock height={34} />
        <SkeletonBlock height={16} width="70%" />
      </AppCard>
    );
  }

  return (
    <AppCard style={[styles.summaryCard, { backgroundColor: portalPalette.surfaceStrong, borderColor: portalPalette.line }]}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.cardKicker, { color: theme.colors.muted }]}>Plan actual</Text>
        <StatusBadge label={formatPortalStatus(subscription.status || 'inactive')} tone={getStatusTone(subscription.status)} />
      </View>
      <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{subscription.planName}</Text>
      <Text style={[styles.summaryDetail, { color: theme.colors.muted }]}>
        {subscription.totalUnits} combis incluidas
      </Text>
    </AppCard>
  );
}

export function UsageUnitsCard({ subscription }: { subscription: PortalSubscription | null }) {
  const theme = { colors: portalColors };
  const total = Math.max(1, Number(subscription?.totalUnits || 0));
  const active = Number(subscription?.activeUnits || 0);
  const percent = Math.min(100, Math.round((active / total) * 100));

  return (
    <AppCard style={[styles.summaryCard, { backgroundColor: portalPalette.surfaceStrong, borderColor: portalPalette.line }]}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.cardKicker, { color: theme.colors.muted }]}>Unidades</Text>
        <Text style={[styles.percent, { color: theme.colors.accent }]}>{percent}%</Text>
      </View>
      <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
        {active}/{subscription?.totalUnits || 0}
      </Text>
      <View style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
        <View style={[styles.progressFill, { backgroundColor: theme.colors.accent, width: `${percent}%` }]} />
      </View>
      <Text style={[styles.summaryDetail, { color: theme.colors.muted }]}>
        {subscription?.availableUnits || 0} disponibles
      </Text>
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

export function PaymentMethodCard({
  method,
  onDelete,
  onDefault,
}: {
  method: PortalPaymentMethod;
  onDelete?: () => void;
  onDefault?: () => void;
}) {
  const theme = { colors: portalColors };
  const isCard = method.type === 'card';

  return (
    <View style={[styles.listItem, { borderColor: theme.colors.line, backgroundColor: theme.colors.surface }]}>
      <View style={[styles.summaryIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
        <MaterialCommunityIcons
          name={isCard ? 'credit-card-outline' : 'bank-outline'}
          size={21}
          color={theme.colors.accent}
        />
      </View>
      <View style={styles.listBody}>
        <Text style={[styles.itemTitle, { color: theme.colors.text }]} numberOfLines={2}>
          {isCard ? `${method.brand} terminacion ${method.last4}` : 'Transferencia SPEI'}
        </Text>
        <Text style={[styles.itemDescription, { color: theme.colors.muted }]} numberOfLines={2}>
          {method.isDefault ? 'Metodo principal' : 'Disponible para pagos'}
        </Text>
      </View>
      <View style={styles.inlineActions}>
        {!method.isDefault ? (
          <Pressable onPress={onDefault} style={[styles.smallButton, { backgroundColor: theme.colors.infoSoft }]}>
            <MaterialCommunityIcons name="star-outline" size={18} color={theme.colors.info} />
          </Pressable>
        ) : null}
        {isCard ? (
          <Pressable onPress={onDelete} style={[styles.smallButton, { backgroundColor: theme.colors.dangerSoft }]}>
            <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.colors.danger} />
          </Pressable>
        ) : null}
      </View>
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
            <Text style={[styles.itemTitle, { color: theme.colors.text }]} numberOfLines={1}>{invoice.id}</Text>
            <Text style={[styles.itemDescription, { color: theme.colors.muted }]} numberOfLines={2}>
              {invoice.referenceCode} - ${Number(invoice.total || 0).toLocaleString('es-MX')} {invoice.currency}
            </Text>
          </View>
          <View style={styles.statusActionGroup}>
            <StatusBadge label={formatPortalStatus(invoice.status)} tone={getStatusTone(invoice.status)} />
            <Pressable
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

export function OnboardingChecklist({
  steps,
  onToggle,
}: {
  steps: PortalOnboardingStep[];
  onToggle?: (step: PortalOnboardingStep) => void;
}) {
  const theme = { colors: portalColors };

  return (
    <View style={styles.list}>
      {steps.map((step) => {
        const done = step.status === 'completed';

        return (
          <Pressable
            key={step.id}
            onPress={() => onToggle?.(step)}
            style={[styles.listItem, { borderColor: theme.colors.line, backgroundColor: theme.colors.surface }]}>
            <View
              style={[
                styles.checkBox,
                {
                  backgroundColor: done ? theme.colors.success : 'transparent',
                  borderColor: done ? theme.colors.success : theme.colors.lineStrong,
                },
              ]}>
              {done ? <MaterialCommunityIcons name="check" size={15} color="#FFFFFF" /> : null}
            </View>
            <View style={styles.listBody}>
              <Text style={[styles.itemTitle, { color: theme.colors.text }]} numberOfLines={2}>{step.title}</Text>
              {step.description ? <Text style={[styles.itemDescription, { color: theme.colors.muted }]} numberOfLines={3}>{step.description}</Text> : null}
            </View>
            <View style={styles.statusActionGroup}>
              <StatusBadge label={formatPortalStatus(step.status)} tone={getStatusTone(step.status)} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function getPortalStatusTone(status?: string) {
  return getStatusTone(status);
}

const styles = StyleSheet.create({
  sectionCard: {
    borderRadius: AppTheme.radius.sm,
    gap: AppTheme.spacing.md,
    minWidth: 0,
  },
  sectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
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
    fontSize: 19,
    fontWeight: '900',
  },
  sectionSubtitle: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  summaryCard: {
    borderRadius: AppTheme.radius.sm,
    flex: 1,
    flexBasis: 230,
    minHeight: 136,
    minWidth: 0,
  },
  summaryTop: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  summaryIcon: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    flexShrink: 0,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  summaryValue: {
    fontFamily: Typography.display,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
    minWidth: 0,
  },
  summaryDetail: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 19,
    minWidth: 0,
  },
  cardKicker: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  percent: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  progressTrack: {
    borderRadius: AppTheme.radius.pill,
    height: 9,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: AppTheme.radius.pill,
    height: 9,
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
  inlineActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    flexWrap: 'wrap',
    gap: 8,
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
  checkBox: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
});
