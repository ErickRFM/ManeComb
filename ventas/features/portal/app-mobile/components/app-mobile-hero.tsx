import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { BrandLogo } from '@/src/components/brand-logo';
import { portalButtonGradient, portalPalette } from '../../portal-theme';
import { styles } from '../app-mobile.styles';

export function AppMobileHero({
  compact,
  appName,
  appStatus,
  appVersion,
  onDownload,
  onNovidades,
}: {
  compact: boolean;
  appName: string;
  appStatus: string;
  appVersion: string;
  onDownload: () => void;
  onNovidades: () => void;
}) {
  return (
    <View style={styles.heroCard}>
      <View style={[compact ? styles.heroBodyCompact : styles.heroBody]}>
        <View style={styles.heroLeft}>
          <BrandLogo size="sm" plain />
          <Text style={styles.heroTitle}>{appName}</Text>
          <Text style={styles.heroDesc}>La aplicación oficial para conductores</Text>
          <View style={styles.heroBadgeRow}>
            <View style={styles.heroBadgeAvailable}>
              <MaterialCommunityIcons name="check-circle" size={14} color={portalPalette.success} />
              <Text style={styles.heroBadgeText}>{appStatus}</Text>
            </View>
            <Text style={styles.heroVersionBadge}>v{appVersion}</Text>
          </View>
          <View style={styles.heroActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Descargar APK de ManeComb"
              onPress={onDownload}
              style={[styles.dlButton, portalButtonGradient()]}>
              <MaterialCommunityIcons name="download" size={20} color="#FFFFFF" />
              <Text style={styles.dlButtonText}>Descargar APK</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ver novedades de esta versión"
              onPress={onNovidades}
              style={styles.novidadesButton}>
              <MaterialCommunityIcons name="newspaper-variant-outline" size={20} color={portalPalette.text} />
              <Text style={styles.novidadesButtonText}>Ver novedades</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.phoneFrame}>
          <View style={styles.phoneNotch} />
          <View style={styles.phoneScreen}>
            <View style={styles.phoneStatusBar}>
              <Text style={styles.phoneStatusText}>9:41</Text>
              <View style={styles.phoneStatusIcons}>
                <MaterialCommunityIcons name="signal" size={10} color="#FFFFFF" />
                <MaterialCommunityIcons name="wifi" size={10} color="#FFFFFF" />
                <MaterialCommunityIcons name="battery" size={12} color="#FFFFFF" />
              </View>
            </View>
            <View style={styles.phoneAppContent}>
              <MaterialCommunityIcons name="bus" size={28} color="#E31E24" />
              <Text style={styles.phoneAppName}>ManeComb</Text>
              <Text style={styles.phoneAppDesc}>Conductor</Text>
            </View>
            <View style={styles.phoneNavBar}>
              <MaterialCommunityIcons name="circle" size={8} color="rgba(255,255,255,0.3)" />
              <MaterialCommunityIcons name="circle" size={8} color="#FFFFFF" />
              <MaterialCommunityIcons name="circle" size={8} color="rgba(255,255,255,0.3)" />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
