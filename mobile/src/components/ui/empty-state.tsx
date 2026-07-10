import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { DesignSystem, Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type EmptyStateProps = {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  description?: string;
};

export function EmptyState({ icon = 'inbox-outline', title, description }: EmptyStateProps) {
  const { theme } = useAppTheme();

  return (
    <View style={[styles.container, { borderColor: theme.colors.line, backgroundColor: theme.colors.surfaceAlt }]}>
      <MaterialCommunityIcons name={icon} size={26} color={theme.colors.muted} />
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {description ? <Text style={[styles.description, { color: theme.colors.muted }]}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: DesignSystem.radius.card,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 8,
    padding: DesignSystem.spacing.lg,
  },
  title: {
    fontFamily: Typography.body,
    fontSize: DesignSystem.typography.subtitle.size,
    fontWeight: DesignSystem.typography.subtitle.weight,
    lineHeight: DesignSystem.typography.subtitle.lineHeight,
    textAlign: 'center',
  },
  description: {
    fontFamily: Typography.body,
    fontSize: DesignSystem.typography.caption.size,
    lineHeight: DesignSystem.typography.caption.lineHeight,
    maxWidth: 420,
    textAlign: 'center',
  },
});
