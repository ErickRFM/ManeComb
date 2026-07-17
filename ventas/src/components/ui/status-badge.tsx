import { StyleSheet, Text, View } from 'react-native';
import { DesignSystem, getToneColors, Typography, type DesignTone } from '@/constants/theme';

export type StatusBadgeTone = DesignTone;

type StatusBadgeProps = {
  label: string;
  tone?: StatusBadgeTone;
};

export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  const colors = getToneColors(tone);

  return (
    <View style={[styles.badge, { backgroundColor: colors.background }]}>
      <Text style={[styles.label, { color: colors.foreground }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: DesignSystem.radius.chip,
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
