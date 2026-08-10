import { memo } from 'react';
import { Platform, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { BrandLogo } from '@/src/components/brand-logo';
import { pulse as pulseDot } from '@/src/native/motion';
import { neonPalette } from '../constants';
import { styles } from '../styles';
import { usePrefersReducedMotion, usePointerParallax, webStyle } from '../utils';
import type { IconName } from '../types';

function FloatingIndicator({
  color,
  icon,
  label,
  style,
  value,
}: {
  color: string;
  icon: IconName;
  label: string;
  style: any;
  value: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <View
      style={[
        styles.floatingIndicator,
        style,
        { borderColor: `${color}58` },
        webStyle({
          backgroundImage: `linear-gradient(135deg, rgba(7, 12, 30, 0.82), ${color}12)`,
          boxShadow: `0 0 0 1px ${color}20, 0 0 24px ${color}20, 0 12px 30px rgba(0,0,0,0.26)`,
          backdropFilter: 'blur(14px)',
          animation: reducedMotion ? undefined : 'manecombFloat 9s ease-in-out infinite',
        }),
      ]}>
      <View style={[styles.floatingIcon, { backgroundColor: `${color}15` }]}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
      </View>
      <View style={styles.floatingTextBlock}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.floatingValue, { color, fontSize: 17, lineHeight: 21 }]}>
          {value}
        </Text>
        <Text style={styles.floatingLabel}>{label}</Text>
      </View>
    </View>
  );
}

const DashboardMockup = memo(function DashboardMockup({ isPhone }: { isPhone: boolean }) {
  const reducedMotion = usePrefersReducedMotion();
  const frameRef = usePointerParallax(
    Platform.OS === 'web' && !isPhone && !reducedMotion,
    (cursor) => `perspective(950px) rotateY(${-7 + cursor.x * 1.3}deg) rotateX(${4 - cursor.y * 1.2}deg)`
  );

  return (
    <View style={[styles.heroVisual, isPhone ? styles.heroVisualPhone : undefined]}>
      <View
        ref={frameRef as never}
        style={[
          styles.dashboardFrame,
          isPhone ? styles.dashboardFramePhone : undefined,
          webStyle({
            boxShadow:
              '0 0 0 1px rgba(0, 194, 255, 0.34), 0 0 38px rgba(0, 194, 255, 0.17), 0 38px 82px rgba(0,0,0,0.4)',
            transformStyle: 'preserve-3d',
          }),
        ]}>
        <View style={styles.dashboardSidebar}>
          {isPhone ? <Text style={styles.dashboardMiniBrand}>MC</Text> : <BrandLogo size="sm" plain />}
          {['Mapa', 'Rutas', 'Radio', 'Alertas', 'Documentos'].map((item, index) => (
            <View key={item} style={[styles.dashboardNavRow, index === 0 ? styles.dashboardNavRowActive : undefined]}>
              <View style={[styles.dashboardNavDot, index === 0 ? styles.dashboardNavDotActive : undefined]} />
              <Text style={styles.dashboardNavText}>{item}</Text>
            </View>
          ))}
        </View>
        <View style={styles.dashboardMain}>
          <View style={styles.dashboardTopbar}>
            <Text style={styles.dashboardTitle} numberOfLines={2}>
              {isPhone ? 'Seguimiento' : 'Seguimiento operativo'}
            </Text>
            <View style={styles.dashboardStatus}>
              <View style={[styles.liveDot, reducedMotion ? undefined : pulseDot()]} />
              <Text style={styles.dashboardStatusText}>En vivo</Text>
            </View>
          </View>
          <View style={styles.mapPanel}>
            <View style={styles.mapGrid} />
            <View style={[styles.mapRoute, styles.mapRouteCyan]} />
            <View style={[styles.mapRoute, styles.mapRoutePink]} />
            <View style={[styles.mapRoute, styles.mapRouteViolet]} />
            {[
              { left: '18%', top: '30%', color: neonPalette.cyan },
              { left: '46%', top: '47%', color: neonPalette.accent },
              { left: '70%', top: '28%', color: neonPalette.mint },
              { left: '78%', top: '64%', color: neonPalette.violet },
            ].map((pin, index) => (
              <View
                key={`pin-${index}`}
                style={[
                  styles.vehiclePin,
                  {
                    left: pin.left as any,
                    top: pin.top as any,
                    borderColor: `${pin.color}77`,
                    backgroundColor: `${pin.color}24`,
                  },
                  webStyle({ boxShadow: `0 0 16px ${pin.color}60` }),
                ]}>
                <MaterialCommunityIcons name="bus" size={16} color={pin.color} />
              </View>
            ))}
          </View>
        </View>
      </View>

      <FloatingIndicator
        icon="map-marker-path"
        label="GPS y rutas"
        value="En vivo"
        color={neonPalette.cyan}
        style={isPhone ? styles.floatingIndicatorPhoneA : styles.floatingIndicatorA}
      />
      <FloatingIndicator
        icon="radio-handheld"
        label="Chat, radio y llamadas"
        value="Conectado"
        color={neonPalette.accent}
        style={isPhone ? styles.floatingIndicatorPhoneB : styles.floatingIndicatorB}
      />
      <FloatingIndicator
        icon="file-document-check-outline"
        label="Documentos y alertas"
        value="Centralizado"
        color={neonPalette.mint}
        style={isPhone ? styles.floatingIndicatorPhoneC : styles.floatingIndicatorC}
      />
    </View>
  );
});

export { DashboardMockup };