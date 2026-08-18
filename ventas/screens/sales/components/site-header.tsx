import { Platform, Pressable, Text, View } from 'react-native';
import { BrandLogo } from '@/src/components/brand-logo';
import { styles } from '../styles';
import { webStyle } from '../utils';
import { ActionButton } from './section-heading';

const navItems = [
  { label: 'Plataforma', target: 'funcionalidades' },
  { label: 'Planes', target: 'planes' },
  { label: 'App móvil', target: 'descargar' },
  { label: 'Confianza', target: 'confianza' },
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
          hovered ? styles.navItemHover : undefined,
          webStyle({
            cursor: 'pointer',
            transitionDuration: '180ms',
            transitionProperty: 'color, background-color, border-color, transform',
          }),
        ];
      }}>
      <Text style={styles.navItemText}>{item.label}</Text>
    </Pressable>
  ));

  return (
    <View
      style={[
        styles.headerShell,
        compact ? styles.headerShellCompact : undefined,
        stacked ? styles.headerShellPhone : undefined,
        stacked ? { minHeight: 68, paddingVertical: 9 } : undefined,
        webStyle({
          backdropFilter: 'blur(22px) saturate(160%)',
          WebkitBackdropFilter: 'blur(22px) saturate(160%)',
          boxShadow: compact
            ? '0 12px 34px rgba(0, 0, 0, 0.3), 0 1px 0 rgba(245, 247, 255, 0.08)'
            : '0 1px 0 rgba(245, 247, 255, 0.08)',
        }),
      ]}>
      <View style={[styles.headerInner, stacked ? styles.headerInnerPhone : undefined, stacked ? { gap: 0 } : undefined]}>
        <View style={styles.headerTopRow}>
          <BrandLogo size={stacked ? 'sm' : 'md'} align="left" plain />
          {stacked ? (
            <View style={[styles.headerActions, { gap: 6 }]}>
              <ActionButton label={loginLabel} icon="login" variant="ghost" compact onPress={onLogin} />
              <ActionButton label="Ver planes" icon="arrow-down" compact onPress={onBuy} />
            </View>
          ) : null}
        </View>

        {!stacked ? <View style={styles.headerNav}>{navButtons}</View> : null}

        {!stacked ? (
          <View style={styles.headerActions}>
            <ActionButton label={loginLabel} icon="login" variant="ghost" compact onPress={onLogin} />
            <ActionButton label="Ver planes" icon="arrow-down" compact onPress={onBuy} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
