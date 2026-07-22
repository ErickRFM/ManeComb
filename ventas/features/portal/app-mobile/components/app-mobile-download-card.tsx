import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { portalButtonGradient, portalPalette } from '../../portal-theme';
import { styles } from '../app-mobile.styles';

export function AppMobileDownloadCard({
  compact,
  qrSvg,
  androidMin,
  size,
  version,
  onDownload,
}: {
  compact: boolean;
  qrSvg: string | null;
  androidMin: string;
  size: string;
  version: string;
  onDownload: () => void;
}) {
  return (
    <View style={[styles.downloadCard, compact ? styles.downloadCardCompact : undefined]}>
      <View style={styles.qrWrap}>
        {qrSvg ? (
          <SvgXml xml={qrSvg} width={140} height={140} />
        ) : (
          <View style={styles.qrLoading}>
            <MaterialCommunityIcons name="qrcode" size={48} color={portalPalette.muted} />
          </View>
        )}
        <Text style={styles.qrHint}>Escanea desde tu teléfono</Text>
      </View>
      <View style={styles.downloadInfoWrap}>
        <Text style={styles.downloadTitle}>Aplicación para conductores</Text>
        <Text style={styles.downloadSubtitle}>
          Descarga el APK e instálalo en el dispositivo Android de tus conductores.
        </Text>
        <View style={styles.downloadMeta}>
          <View style={styles.metaPill}>
            <MaterialCommunityIcons name="android" size={14} color={portalPalette.info} />
            <Text style={styles.metaPillText}>Android {androidMin}+</Text>
          </View>
          <View style={styles.metaPill}>
            <MaterialCommunityIcons name="harddisk" size={14} color={portalPalette.info} />
            <Text style={styles.metaPillText}>{size}</Text>
          </View>
          <View style={styles.metaPill}>
            <MaterialCommunityIcons name="tag-text-outline" size={14} color={portalPalette.info} />
            <Text style={styles.metaPillText}>v{version}</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Descargar APK de ManeComb"
          onPress={onDownload}
          style={[styles.dlButtonLarge, portalButtonGradient()]}>
          <MaterialCommunityIcons name="download" size={22} color="#FFFFFF" />
          <Text style={styles.dlButtonLargeText}>Descargar APK</Text>
        </Pressable>
      </View>
    </View>
  );
}
