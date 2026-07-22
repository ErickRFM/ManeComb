import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { BrandLogo } from '@/src/components/brand-logo';
import { authStyles as s } from '../auth.styles';

type Props = {
  isRegister: boolean;
  logoSize: 'sm' | 'md';
};

export function AuthHeader({ isRegister, logoSize }: Props) {
  return (
    <>
      <View style={s.brandRow}>
        <View style={s.logoWrap}>
          <BrandLogo size={logoSize} tone="light" plain />
        </View>
        <View style={s.portalBadge}>
          <MaterialCommunityIcons name="shield-lock-outline" size={14} color="#FF4D7D" />
          <Text style={s.portalBadgeText}>Portal ManeComb</Text>
        </View>
      </View>

      <View style={s.headingBlock}>
        <Text style={s.title}>{isRegister ? 'Crear cuenta' : 'Iniciar sesión'}</Text>
        <Text style={s.subtitle}>
          {isRegister ? 'Activa tu portal de flotilla.' : 'Entra a ventas y administracion.'}
        </Text>
      </View>
    </>
  );
}
