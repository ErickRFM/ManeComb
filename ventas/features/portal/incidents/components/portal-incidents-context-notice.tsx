import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Text, View } from 'react-native';
import { palette } from '@/constants/theme';
import { styles } from '../incidents.styles';

export function PortalIncidentsContextNotice() {
  return (
    <View style={[styles.contextNotice, { backgroundColor: palette.infoSoft, borderColor: palette.line }]}>
      <View style={[styles.contextIcon, { backgroundColor: palette.surfaceAlt }]}>
        <MaterialCommunityIcons name="alert-circle-outline" size={20} color={palette.info} />
      </View>
      <View style={styles.contextCopy}>
        <Text style={[styles.contextTitle, { color: palette.text }]}>Gestión de incidencias</Text>
        <Text style={[styles.contextText, { color: palette.muted }]}>
          Revisa, da seguimiento y cierra las incidencias reportadas durante las operaciones.
        </Text>
      </View>
    </View>
  );
}
