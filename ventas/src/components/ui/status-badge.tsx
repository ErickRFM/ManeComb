import { StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

export type StatusBadgeTone = 'positive' | 'warning' | 'danger' | 'info' | 'neutral';

type StatusBadgeProps = {
  label: string;
  tone?: StatusBadgeTone;
};

export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  const { theme } = useAppTheme();
  const colors = {
    positive: [theme.colors.successSoft, theme.colors.success],
    warning: [theme.colors.warningSoft, theme.colors.warning],
    danger: [theme.colors.dangerSoft, theme.colors.danger],
    info: [theme.colors.infoSoft, theme.colors.info],
    neutral: [theme.colors.surfaceAlt, theme.colors.muted],
  } as const;

  return (
    <View style={[styles.badge, { backgroundColor: colors[tone][0] }]}>
      <Text style={[styles.label, { color: colors[tone][1] }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: AppTheme.radius.pill,
    flexShrink: 1,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  label: {
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 14,
    minWidth: 0,
    textAlign: 'center',
  },
});
