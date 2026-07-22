import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Text, View } from 'react-native';
import { portalPalette } from '../../portal-theme';
import { styles } from '../app-mobile.styles';

export function AppAdminAccessRestricted() {
  return (
    <View style={styles.card}>
      <View style={styles.emptyState}>
        <MaterialCommunityIcons name="shield-lock-outline" size={48} color={portalPalette.muted} />
        <Text style={styles.emptyTitle}>Acceso restringido</Text>
        <Text style={styles.emptyDesc}>Solo el administrador puede gestionar la aplicación.</Text>
      </View>
    </View>
  );
}
