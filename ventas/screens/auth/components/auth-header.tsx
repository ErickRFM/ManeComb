import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { BrandLogo } from '@/src/components/brand-logo';
import { router } from '@/src/navigation/router';
import { authStyles as s } from '../auth.styles';

type Props = {
  isRegister: boolean;
  logoSize: 'sm' | 'md';
  subtitle?: string;
  title?: string;
};

export function AuthHeader({ isRegister, logoSize, subtitle, title }: Props) {
  return (
    <>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Volver a la página principal de ManeComb"
        onPress={() => router.push('/ventas' as never)}
        style={({ hovered, pressed }: any) => ({
          alignItems: 'center',
          alignSelf: 'flex-start',
          borderRadius: 999,
          flexDirection: 'row',
          gap: 6,
          minHeight: 34,
          opacity: pressed ? 0.72 : 1,
          paddingHorizontal: 9,
          transform: [{ translateX: hovered ? -2 : 0 }],
        })}>
        <MaterialCommunityIcons name="arrow-left" size={16} color="#A8B1C2" />
        <Text style={{ color: '#A8B1C2', fontSize: 11, fontWeight: '800' }}>Volver a inicio</Text>
      </Pressable>
      <View style={s.brandRow}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Ir a ManeComb Ventas"
          onPress={() => router.push('/ventas' as never)}>
          <View style={s.logoWrap}>
            <BrandLogo size={logoSize} tone="light" plain />
          </View>
        </Pressable>
        <View style={s.portalBadge}>
          <MaterialCommunityIcons name="shield-lock-outline" size={14} color="#FF4D7D" />
          <Text style={s.portalBadgeText}>Portal ManeComb</Text>
        </View>
      </View>
      <View style={s.headingBlock}>
        <Text accessibilityRole="header" style={s.title}>{title || (isRegister ? 'Crear cuenta' : 'Iniciar sesión')}</Text>
        <Text style={s.subtitle}>{subtitle || (isRegister ? 'Activa tu portal de flotilla.' : 'Entra a ventas y administración.')}</Text>
      </View>
    </>
  );
}
