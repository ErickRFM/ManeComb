import { StyleSheet, Text, View } from 'react-native';
import { DesignSystem, getToneColors, Typography, type DesignTone } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type StatusPillProps = {
  label: string;
  tone?: DesignTone;
};

export function StatusPill({ label, tone = 'neutral' }: StatusPillProps) {
  const { theme } = useAppTheme();
  const toneColors = getToneColors(theme, tone);

  return (
    <View style={[styles.pill, { backgroundColor: toneColors.background }]}>
      <Text style={[styles.label, { color: toneColors.foreground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: DesignSystem.radius.chip,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  label: {
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
  },
});
