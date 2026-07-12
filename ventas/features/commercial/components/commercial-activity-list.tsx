import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { portalPalette } from '@/features/portal/portal-theme';
import type { CommercialActivity } from '../types';

function formatRelativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha pendiente';
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  return `Hace ${days} días`;
}

function getActivityIcon(type: CommercialActivity['type']): string {
  const icons: Record<CommercialActivity['type'], string> = {
    ACCOUNT_CREATED: 'domain-plus',
    PLAN_CONTRACTED: 'clipboard-check-outline',
    CHANGE_REQUESTED: 'calendar-arrow-right',
    CHANGE_CONFIRMED: 'check-decagram-outline',
    RENEWAL: 'calendar-refresh-outline',
    CANCELLATION: 'close-circle-outline',
    REACTIVATION: 'backup-restore',
    PAYMENT_METHOD_ADDED: 'credit-card-check-outline',
    INVOICE_ISSUED: 'receipt-text-outline',
  };
  return icons[type];
}

export function CommercialActivityList({
  activities,
  limit,
}: {
  activities: CommercialActivity[];
  limit?: number;
}) {
  const visible = typeof limit === 'number' ? activities.slice(0, limit) : activities;

  if (!visible.length) {
    return (
      <View style={styles.empty}>
        <MaterialCommunityIcons name="timeline-clock-outline" size={24} color={portalPalette.muted} />
        <Text style={styles.emptyTitle}>Aún no hay actividad comercial</Text>
        <Text style={styles.emptyText}>Los eventos de suscripción aparecerán aquí.</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {visible.map((activity) => (
        <View key={activity.id} style={styles.row}>
          <View style={styles.icon}>
            <MaterialCommunityIcons name={getActivityIcon(activity.type)} size={20} color={portalPalette.info} />
          </View>
          <View style={styles.copy}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{activity.title}</Text>
              <Text style={styles.date}>{formatRelativeDate(activity.occurredAt)}</Text>
            </View>
            <Text style={styles.description}>{activity.description}</Text>
          </View>
          {activity.status === 'pending' ? <StatusBadge label="Pendiente" tone="warning" /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
  },
  row: {
    alignItems: 'flex-start',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 11,
    padding: 12,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: portalPalette.infoSoft,
    borderRadius: 10,
    flexShrink: 0,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  copy: {
    flex: 1,
    flexBasis: 220,
    gap: 3,
    minWidth: 0,
  },
  titleRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  title: {
    color: portalPalette.text,
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  date: {
    color: portalPalette.accent,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
  },
  description: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  empty: {
    alignItems: 'center',
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 5,
    padding: AppTheme.spacing.lg,
  },
  emptyTitle: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  emptyText: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    textAlign: 'center',
  },
});
