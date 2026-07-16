import { StyleSheet, Text, View } from 'react-native';
import { DesignSystem, getToneColors, Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { getPresencePresentation, type PresenceStatus } from '@/src/utils/presence';

export function PresenceDot({ status, size = 10 }: { status: PresenceStatus; size?: number }) {
  const { theme } = useAppTheme();
  const color = status === 'online'
    ? theme.colors.success
    : status === 'offline'
      ? theme.colors.danger
      : theme.colors.muted;
  return <View accessibilityLabel={getPresencePresentation(status).label} style={{
    width: size, height: size, borderRadius: size / 2, backgroundColor: color,
  }} />;
}

export function PresenceBadge({ status }: { status: PresenceStatus }) {
  const { theme } = useAppTheme();
  const presentation = getPresencePresentation(status);
  const colors = getToneColors(theme, presentation.tone);
  return <View style={[styles.badge, { backgroundColor: colors.background }]}>
    <PresenceDot status={status} size={8} />
    <Text style={[styles.label, { color: colors.foreground }]}>{presentation.label}</Text>
  </View>;
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: DesignSystem.radius.chip,
    flexDirection: 'row', gap: 6, paddingHorizontal: 11, paddingVertical: 5 },
  label: { fontFamily: Typography.body, fontSize: 11, fontWeight: '800' },
});
