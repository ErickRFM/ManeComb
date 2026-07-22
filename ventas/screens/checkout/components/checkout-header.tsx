import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { BrandLogo } from '@/src/components/brand-logo';
import { styles as s } from '../checkout.styles';
import { palette } from '../checkout.constants';

type Props = {
  isPhone: boolean;
  onBack: () => void;
};

export function CheckoutHeader({ isPhone, onBack }: Props) {
  return (
    <View style={s.header}>
      <BrandLogo size={isPhone ? 'sm' : 'md'} tone="light" plain />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver y cambiar plan"
        onPress={onBack}
        style={s.backButton}>
        <MaterialCommunityIcons name="arrow-left" size={18} color={palette.text} />
        <Text style={s.backText}>Cambiar plan</Text>
      </Pressable>
    </View>
  );
}
