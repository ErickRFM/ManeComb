import { StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
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
      <MaterialCommunityIcons name={icon} size={28} color={theme.colors.muted} />
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {description ? <Text style={[styles.description, { color: theme.colors.muted }]}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    gap: 8,
    padding: AppTheme.spacing.lg,
  },
  title: {
    fontFamily: Typography.display,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  description: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
