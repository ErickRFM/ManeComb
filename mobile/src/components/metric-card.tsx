import { StyleSheet, Text, View } from 'react-native';
import { AppCard } from '@/src/components/app-card';
import { Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type MetricCardProps = {
  label: string;
  value: string;
  trend: string;
  tone?: 'positive' | 'warning' | 'danger' | 'info';
};

export function MetricCard({ label, value, trend, tone = 'info' }: MetricCardProps) {
  const { theme } = useAppTheme();
  const toneColor = {
    positive: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
    info: theme.colors.info,
  };

  return (
    <AppCard style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.topRow}>
        <Text style={[styles.label, { color: theme.colors.muted }]}>{label}</Text>
        <View style={[styles.dot, { backgroundColor: toneColor[tone] }]} />
      </View>
      <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
      <Text style={[styles.trend, { color: toneColor[tone] }]}>{trend}</Text>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 180,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  value: {
    fontFamily: Typography.display,
    fontSize: 30,
    lineHeight: 34,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 10,
  },
  trend: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
});
