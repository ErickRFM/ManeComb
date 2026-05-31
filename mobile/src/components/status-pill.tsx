import { StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type StatusPillProps = {
  label: string;
  tone?: 'positive' | 'warning' | 'danger' | 'info' | 'neutral';
};

export function StatusPill({ label, tone = 'neutral' }: StatusPillProps) {
  const { theme } = useAppTheme();
  const toneMap = {
    positive: {
      backgroundColor: theme.colors.successSoft,
      color: theme.colors.success,
    },
    warning: {
      backgroundColor: theme.colors.warningSoft,
      color: theme.colors.warning,
    },
    danger: {
      backgroundColor: theme.colors.dangerSoft,
      color: theme.colors.danger,
    },
    info: {
      backgroundColor: theme.colors.infoSoft,
      color: theme.colors.info,
    },
    neutral: {
      backgroundColor: theme.mode === 'light' ? '#EFE7DE' : 'rgba(159, 176, 202, 0.14)',
      color: theme.colors.muted,
    },
  };

  return (
    <View style={[styles.pill, { backgroundColor: toneMap[tone].backgroundColor }]}>
      <Text style={[styles.label, { color: toneMap[tone].color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: AppTheme.radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  label: {
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
  },
});
