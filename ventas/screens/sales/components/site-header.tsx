import { Platform, Pressable, Text, View } from 'react-native';
import { BrandLogo } from '@/src/components/brand-logo';
import { neonPalette } from '../constants';
import { styles } from '../styles';
import { webStyle } from '../utils';
import { ActionButton } from './section-heading';

const navItems = [
  { label: 'Funcionalidades', compactLabel: 'Funciones', target: 'funcionalidades' },
  { label: 'App móvil', compactLabel: 'App', target: 'descargar' },
  { label: 'Planes', compactLabel: 'Planes', target: 'planes' },
  { label: 'Confianza', compactLabel: 'Confianza', target: 'confianza' },
] as const;

export function SiteHeader({
  compact,
  stacked,
  loginLabel,
  onBuy,
  onLogin,
  onNavigate,
}: {
  compact: boolean;
  stacked: boolean;
  loginLabel: string;
  onBuy: () => void;
  onLogin: () => void;
  onNavigate: (target: string) => void;
}) {
  const navButtons = navItems.map((item) => (
    <Pressable
      key={item.target}
      accessibilityRole="link"
      accessibilityLabel={`Ir a ${item.label}`}
      onPress={() => onNavigate(item.target)}
      style={(state) => {
        const hovered = Platform.OS === 'web' && Boolean((state as any).hovered);
        return [
          styles.navItem,
          stacked ? styles.navItemPhone : undefined,
          hovered ? styles.navItemHover : undefined,
          webStyle({
            cursor: 'pointer',
            transitionDuration: '240ms',
            transitionProperty: 'color, background-color, border-color, transform',
          }),
        ];
      }}>
      <Text style={[styles.navItemText, stacked ? styles.navItemTextPhone : undefined]}>
        {stacked ? item.compactLabel : item.label}
      </Text>
    </Pressable>
  ));

  return (
    <View
      style={[
        styles.headerShell,
        compact ? styles.headerShellCompact : undefined,
        stacked ? styles.headerShellPhone : undefined,
        stacked ? { minHeight: 100, paddingVertical: 8 } : undefined,
        webStyle({
          backdropFilter: 'blur(22px) saturate(160%)',
          WebkitBackdropFilter: 'blur(22px) saturate(160%)',
          boxShadow: compact
            ? '0 14px 42px rgba(0, 0, 0, 0.34), 0 1px 0 rgba(245, 247, 255, 0.08)'
            : '0 1px 0 rgba(245, 247, 255, 0.08)',
        }),
      ]}>
      <View style={[styles.headerInner, stacked ? styles.headerInnerPhone : undefined, stacked ? { gap: 7 } : undefined]}>
        <View style={styles.headerTopRow}>
          <BrandLogo size={stacked ? 'sm' : 'md'} align="left" plain />
          {stacked ? (
            <View style={styles.headerActions}>
              <ActionButton label="Entrar" icon="login" variant="ghost" compact onPress={onLogin} />
              <ActionButton label="Comprar" icon="arrow-right" compact onPress={onBuy} />
            </View>
          ) : null}
        </View>

        {stacked ? (
          <View style={[styles.headerNav, { flex: 0, justifyContent: 'space-between', width: '100%' }]}>
            {navButtons}
          </View>
        ) : (
          <View style={styles.headerNav}>{navButtons}</View>
        )}

        {!stacked ? (
          <View style={styles.headerActions}>
            <ActionButton label={loginLabel} icon="login" variant="ghost" compact onPress={onLogin} />
            <ActionButton label="Comprar ahora" icon="arrow-right" compact onPress={onBuy} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
