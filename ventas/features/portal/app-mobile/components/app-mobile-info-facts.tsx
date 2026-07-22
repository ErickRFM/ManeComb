import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Text, View } from 'react-native';
import { portalPalette } from '../../portal-theme';
import { styles } from '../app-mobile.styles';

export function AppMobileInfoFacts({ facts }: { facts: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }[] }) {
  return (
    <View style={styles.infoRow}>
      {facts.map((fact) => (
        <View key={fact.label} style={styles.infoFactCard}>
          <View style={styles.infoFactIconWrap}>
            <MaterialCommunityIcons name={fact.icon} size={22} color={portalPalette.info} />
          </View>
          <Text style={styles.infoFactLabel}>{fact.label}</Text>
          <Text style={styles.infoFactValue}>{fact.value}</Text>
        </View>
      ))}
    </View>
  );
}
