import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { useAppTheme } from '@/src/hooks/use-app-theme';
import type { createStyles } from '../profile-screen.styles';

export function InfoTile({
  icon,
  label,
  value,
  styles,
  theme,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
  theme: ReturnType<typeof useAppTheme>['theme'];
}) {
  return (
    <View style={styles.infoTile}>
      <View style={styles.infoIcon}>
        <MaterialCommunityIcons name={icon} size={20} color={theme.colors.accent} />
      </View>
      <View>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}
