import { StyleSheet, Text, View } from 'react-native';
import { AppCard } from '@/src/components/app-card';
import { DesignSystem, getToneColors, Typography, type DesignTone } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type MetricCardProps = {
  label: string;
  value: string;
  trend: string;
  tone?: Exclude<DesignTone, 'neutral'>;
};

export function MetricCard({ label, value, trend, tone = 'info' }: MetricCardProps) {
  const { theme } = useAppTheme();
  const toneColors = getToneColors(theme, tone);

  return (
    <AppCard style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.topRow}>
        <Text style={[styles.label, { color: theme.colors.muted }]}>{label}</Text>
        <View style={[styles.dot, { backgroundColor: toneColors.foreground }]} />
      </View>
      <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
      <Text style={[styles.trend, { color: toneColors.foreground }]}>{trend}</Text>
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
    fontSize: DesignSystem.typography.overline.size,
    fontWeight: DesignSystem.typography.overline.weight,
    lineHeight: DesignSystem.typography.overline.lineHeight,
    textTransform: 'uppercase',
  },
  value: {
    fontFamily: Typography.display,
    fontSize: DesignSystem.typography.hero.size,
    lineHeight: DesignSystem.typography.hero.lineHeight,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 10,
  },
  trend: {
    fontFamily: Typography.body,
    fontSize: DesignSystem.typography.caption.size,
    fontWeight: DesignSystem.typography.caption.weight,
    lineHeight: DesignSystem.typography.caption.lineHeight,
  },
});
