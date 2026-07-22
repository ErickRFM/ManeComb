import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Text, View } from 'react-native';
import { palette } from '@/constants/theme';
import { PortalButton } from '../../components/portal-button';
import { styles } from '../units.styles';

type PortalUnitsContinuityBannerProps = {
  onAssignRoute: () => void;
};

export function PortalUnitsContinuityBanner({ onAssignRoute }: PortalUnitsContinuityBannerProps) {
  return (
    <View style={[styles.continuityBanner, { backgroundColor: palette.infoSoft, borderColor: palette.line }]}>
      <MaterialCommunityIcons name="check-circle" size={18} color={palette.info} />
      <Text style={[styles.continuityText, { color: palette.text }]}>Unidad creada. El siguiente paso es asignar una ruta.</Text>
      <PortalButton icon="arrow-right" onPress={onAssignRoute} size="sm">Asignar ruta</PortalButton>
    </View>
  );
}
