import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Text, View } from 'react-native';
import { palette } from '@/constants/theme';
import { PortalButton } from '../../components/portal-button';
import { styles } from '../users.styles';

export function PortalUsersContextNotice({ onOpenActivation }: { onOpenActivation: () => void }) {
  return (
    <View style={[styles.contextNotice, { backgroundColor: palette.infoSoft, borderColor: palette.line }]}>
      <View style={[styles.contextIcon, { backgroundColor: palette.surfaceAlt }]}>
        <MaterialCommunityIcons name="key-variant" size={20} color={palette.info} />
      </View>
      <View style={styles.contextCopy}>
        <Text style={[styles.contextTitle, { color: palette.text }]}>Incorporar conductores mediante keys</Text>
        <Text style={[styles.contextText, { color: palette.muted }]}>
          Los conductores se registran exclusivamente con una key de activación. Genérala en Activación; cuando el chofer complete el registro, aparecerá automáticamente en el equipo.
        </Text>
      </View>
      <PortalButton icon="key-plus" onPress={onOpenActivation}>Ir a activación</PortalButton>
    </View>
  );
}
