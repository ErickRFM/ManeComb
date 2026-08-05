import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import QRCode from 'qrcode';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { getAppInfoRequest } from '@/src/api/client';
import type { PortalAppInfo } from '@/src/types/app';
import { Typography } from '@/constants/theme';
import { neonPalette } from '../constants';
import { webStyle } from '../utils';
import { SectionHeading } from './section-heading';

const operatorFeatures = [
  { icon: 'map-marker-radius-outline', label: 'GPS y ruta en tiempo real' },
  { icon: 'message-text-outline', label: 'Chat y coordinación operativa' },
  { icon: 'clipboard-check-outline', label: 'Checklist, documentos e incidencias' },
] as const;

function formatReleaseDate(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return 'Publicación administrada desde ManeComb';

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function getStatusTone(status?: string | null, hasDownload = false) {
  const normalized = String(status || '').trim().toLowerCase();
  const available = hasDownload && !['mantenimiento', 'pausada', 'no disponible', 'archivada'].some((entry) => normalized.includes(entry));

  return {
    available,
    color: available ? neonPalette.mint : neonPalette.amber,
    label: String(status || '').trim() || (available ? 'Disponible' : 'Próximamente'),
  };
}

export function AppDownloadSection({ onPortalPress }: { onPortalPress: () => void }) {
  const { width } = useWindowDimensions();
  const stacked = width < 900;
  const isPhone = width < 640;
  const [appInfo, setAppInfo] = useState<PortalAppInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    let active = true;

    getAppInfoRequest()
      .then((result) => {
        if (!active) return;
        setAppInfo(result);
        setLoadFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setLoadFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const downloadUrl = String(appInfo?.apkUrl || '').trim();
  const statusTone = getStatusTone(appInfo?.status, Boolean(downloadUrl));
  const releaseNotes = useMemo(
    () => (Array.isArray(appInfo?.releaseNotes) ? appInfo.releaseNotes.filter(Boolean).slice(0, 3) : []),
    [appInfo?.releaseNotes]
  );

  useEffect(() => {
    let active = true;

    if (!downloadUrl) {
      setQrDataUrl('');
      return () => {
        active = false;
      };
    }

    QRCode.toDataURL(downloadUrl, {
      width: 220,
      margin: 1,
      color: { dark: '#081027', light: '#FFFFFF' },
    })
      .then((value) => {
        if (active) setQrDataUrl(value);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [downloadUrl]);

  const handleDownload = () => {
    if (!downloadUrl || !statusTone.available) return;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    void Linking.openURL(downloadUrl);
  };

  return (
    <View nativeID="descargar" style={styles.anchor}>
      <View
        style={[
          styles.shell,
          stacked ? styles.shellStacked : undefined,
          isPhone ? styles.shellPhone : undefined,
          webStyle({
            backgroundImage:
              'linear-gradient(135deg, rgba(8, 14, 34, 0.94), rgba(10, 18, 43, 0.82)), radial-gradient(circle at 18% 18%, rgba(47, 255, 213, 0.15), transparent 34%), radial-gradient(circle at 86% 72%, rgba(255, 45, 122, 0.16), transparent 35%)',
            boxShadow: '0 32px 110px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06)',
            scrollMarginTop: 120,
          }),
        ]}>
        <View style={[styles.visualColumn, stacked ? styles.visualColumnStacked : undefined]}>
          <View style={styles.orbit} pointerEvents="none" />
          <View style={[styles.phone, isPhone ? styles.phonePhone : undefined]}>
            <View style={styles.phoneTop}>
              <View style={styles.phoneSpeaker} />
              <View style={styles.phoneCamera} />
            </View>

            <View style={styles.phoneScreen}>
              <View style={styles.mobileHeader}>
                <View>
                  <Text style={styles.mobileEyebrow}>UNIDAD ACTIVA</Text>
                  <Text style={styles.mobileTitle}>Ruta Centro · C-06</Text>
                </View>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>EN VIVO</Text>
                </View>
              </View>

              <View style={styles.mapPanel}>
                <View style={[styles.mapRoute, styles.mapRouteOne]} />
                <View style={[styles.mapRoute, styles.mapRouteTwo]} />
                <View style={[styles.mapPoint, styles.mapPointStart]}>
                  <MaterialCommunityIcons name="bus" size={16} color="#071027" />
                </View>
                <View style={[styles.mapPoint, styles.mapPointEnd]}>
                  <MaterialCommunityIcons name="map-marker" size={16} color="#071027" />
                </View>
                <View style={styles.etaCard}>
                  <Text style={styles.etaLabel}>Siguiente parada</Text>
                  <Text style={styles.etaValue}>4 min · 1.8 km</Text>
                </View>
              </View>

              <View style={styles.mobileStats}>
                <View style={styles.mobileStat}>
                  <MaterialCommunityIcons name="speedometer" size={18} color={neonPalette.cyan} />
                  <Text style={styles.mobileStatValue}>38 km/h</Text>
                  <Text style={styles.mobileStatLabel}>Velocidad</Text>
                </View>
                <View style={styles.mobileStat}>
                  <MaterialCommunityIcons name="signal" size={18} color={neonPalette.mint} />
                  <Text style={styles.mobileStatValue}>Óptima</Text>
                  <Text style={styles.mobileStatLabel}>Conexión</Text>
                </View>
              </View>

              <View style={styles.mobileAlert}>
                <View style={styles.mobileAlertIcon}>
                  <MaterialCommunityIcons name="bell-ring-outline" size={18} color={neonPalette.accent} />
                </View>
                <View style={styles.mobileAlertCopy}>
                  <Text style={styles.mobileAlertTitle}>Central conectada</Text>
                  <Text style={styles.mobileAlertBody}>Chat, radio y alertas en una sola vista.</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={[styles.visualBadge, styles.visualBadgeTop]}>
            <MaterialCommunityIcons name="shield-check-outline" size={19} color={neonPalette.mint} />
            <View>
              <Text style={styles.visualBadgeValue}>Instalación segura</Text>
              <Text style={styles.visualBadgeLabel}>Canal oficial ManeComb</Text>
            </View>
          </View>

          <View style={[styles.visualBadge, styles.visualBadgeBottom]}>
            <MaterialCommunityIcons name="navigation-variant-outline" size={19} color={neonPalette.cyan} />
            <View>
              <Text style={styles.visualBadgeValue}>Operación móvil</Text>
              <Text style={styles.visualBadgeLabel}>Lista para conductores</Text>
            </View>
          </View>
        </View>

        <View style={styles.contentColumn}>
          <SectionHeading
            eyebrow="APP MÓVIL PARA LA OPERACIÓN"
            title="ManeComb también viaja dentro de cada unidad"
            intro="Conecta a conductores, supervisores y central desde Android. La versión publicada en el Mobile App Center se refleja aquí automáticamente, sin duplicar enlaces ni información."
          />

          {loading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={neonPalette.cyan} />
              <Text style={styles.loadingText}>Consultando la versión disponible...</Text>
            </View>
          ) : (
            <>
              <View style={styles.versionRow}>
                <View style={[styles.statusBadge, { borderColor: `${statusTone.color}66`, backgroundColor: `${statusTone.color}14` }]}>
                  <View style={[styles.statusDot, { backgroundColor: statusTone.color }]} />
                  <Text style={[styles.statusText, { color: statusTone.color }]}>{statusTone.label}</Text>
                </View>
                <Text style={styles.versionText}>Android · v{String(appInfo?.version || '—')}</Text>
              </View>

              <View style={styles.featureList}>
                {operatorFeatures.map((feature) => (
                  <View key={feature.label} style={styles.featureRow}>
                    <View style={styles.featureIcon}>
                      <MaterialCommunityIcons name={feature.icon} size={20} color={neonPalette.cyan} />
                    </View>
                    <Text style={styles.featureText}>{feature.label}</Text>
                  </View>
                ))}
              </View>

              <View style={[styles.releaseGrid, stacked ? styles.releaseGridStacked : undefined]}>
                <View style={styles.releaseCard}>
                  <Text style={styles.releaseLabel}>REQUISITOS</Text>
                  <Text style={styles.releaseValue}>Android {String(appInfo?.androidMin || '8.0')}+</Text>
                  <Text style={styles.releaseMeta}>{String(appInfo?.size || 'Tamaño por confirmar')}</Text>
                </View>
                <View style={styles.releaseCard}>
                  <Text style={styles.releaseLabel}>ÚLTIMA PUBLICACIÓN</Text>
                  <Text style={styles.releaseValue}>{formatReleaseDate(appInfo?.releaseDate)}</Text>
                  <Text style={styles.releaseMeta}>Actualizada desde el portal</Text>
                </View>
              </View>

              {releaseNotes.length ? (
                <View style={styles.notesCard}>
                  <Text style={styles.notesTitle}>Novedades de esta versión</Text>
                  {releaseNotes.map((note) => (
                    <View key={note} style={styles.noteRow}>
                      <MaterialCommunityIcons name="check-circle" size={16} color={neonPalette.mint} />
                      <Text style={styles.noteText}>{note}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {loadFailed ? (
                <View style={styles.warningRow}>
                  <MaterialCommunityIcons name="cloud-alert-outline" size={18} color={neonPalette.amber} />
                  <Text style={styles.warningText}>No pudimos confirmar la versión en este momento. Puedes revisarla desde el portal.</Text>
                </View>
              ) : null}

              <View style={styles.actionRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={!statusTone.available}
                  onPress={handleDownload}
                  style={({ pressed }) => [
                    styles.downloadButton,
                    !statusTone.available ? styles.downloadButtonDisabled : undefined,
                    pressed && statusTone.available ? styles.buttonPressed : undefined,
                    webStyle({ cursor: statusTone.available ? 'pointer' : 'not-allowed' }),
                  ]}>
                  <MaterialCommunityIcons name="download" size={21} color="#FFFFFF" />
                  <View>
                    <Text style={styles.downloadButtonLabel}>
                      {statusTone.available ? 'Descargar app Android' : 'Descarga no disponible'}
                    </Text>
                    <Text style={styles.downloadButtonMeta}>APK oficial · versión {String(appInfo?.version || 'actual')}</Text>
                  </View>
                </Pressable>

                <Pressable
                  accessibilityRole="link"
                  onPress={onPortalPress}
                  style={({ pressed }) => [
                    styles.portalButton,
                    pressed ? styles.buttonPressed : undefined,
                    webStyle({ cursor: 'pointer' }),
                  ]}>
                  <MaterialCommunityIcons name="monitor-dashboard" size={20} color={neonPalette.text} />
                  <Text style={styles.portalButtonText}>Abrir portal</Text>
                </Pressable>
              </View>

              {qrDataUrl && !isPhone ? (
                <View style={styles.qrCard}>
                  <View style={styles.qrImageShell}>
                    <Image source={{ uri: qrDataUrl }} resizeMode="contain" style={styles.qrImage} />
                  </View>
                  <View style={styles.qrCopy}>
                    <Text style={styles.qrTitle}>Escanea desde tu Android</Text>
                    <Text style={styles.qrText}>Abre la descarga oficial sin copiar enlaces ni buscar archivos externos.</Text>
                  </View>
                </View>
              ) : null}
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    width: '100%',
  },
  shell: {
    alignItems: 'center',
    backgroundColor: 'rgba(8, 14, 34, 0.94)',
    borderColor: 'rgba(245, 247, 255, 0.11)',
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 50,
    minHeight: 700,
    overflow: 'hidden',
    paddingHorizontal: 52,
    paddingVertical: 56,
  },
  shellStacked: {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: 34,
    paddingHorizontal: 30,
  },
  shellPhone: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 32,
  },
  visualColumn: {
    alignItems: 'center',
    flex: 0.92,
    justifyContent: 'center',
    minHeight: 570,
    position: 'relative',
  },
  visualColumnStacked: {
    minHeight: 530,
  },
  orbit: {
    backgroundColor: 'rgba(0, 194, 255, 0.06)',
    borderColor: 'rgba(0, 194, 255, 0.19)',
    borderRadius: 999,
    borderWidth: 1,
    height: 430,
    position: 'absolute',
    width: 430,
  },
  phone: {
    backgroundColor: '#050816',
    borderColor: 'rgba(245, 247, 255, 0.22)',
    borderRadius: 38,
    borderWidth: 2,
    height: 520,
    overflow: 'hidden',
    padding: 10,
    width: 268,
    zIndex: 2,
  },
  phonePhone: {
    height: 470,
    width: 242,
  },
  phoneTop: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 22,
    justifyContent: 'center',
    position: 'relative',
  },
  phoneSpeaker: {
    backgroundColor: 'rgba(245,247,255,0.18)',
    borderRadius: 4,
    height: 5,
    width: 52,
  },
  phoneCamera: {
    backgroundColor: 'rgba(0,194,255,0.38)',
    borderRadius: 5,
    height: 7,
    marginLeft: 8,
    width: 7,
  },
  phoneScreen: {
    backgroundColor: '#071027',
    borderRadius: 28,
    flex: 1,
    gap: 12,
    overflow: 'hidden',
    padding: 14,
  },
  mobileHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mobileEyebrow: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  mobileTitle: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 3,
  },
  liveBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(47,255,213,0.1)',
    borderColor: 'rgba(47,255,213,0.28)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  liveDot: {
    backgroundColor: neonPalette.mint,
    borderRadius: 4,
    height: 6,
    width: 6,
  },
  liveText: {
    color: neonPalette.mint,
    fontFamily: Typography.body,
    fontSize: 7,
    fontWeight: '900',
  },
  mapPanel: {
    backgroundColor: 'rgba(0,194,255,0.055)',
    borderColor: 'rgba(0,194,255,0.18)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    minHeight: 220,
    overflow: 'hidden',
    position: 'relative',
  },
  mapRoute: {
    backgroundColor: neonPalette.cyan,
    borderRadius: 4,
    height: 3,
    position: 'absolute',
  },
  mapRouteOne: {
    left: 28,
    top: 82,
    transform: [{ rotate: '-18deg' }],
    width: 178,
  },
  mapRouteTwo: {
    left: 74,
    top: 134,
    transform: [{ rotate: '22deg' }],
    width: 128,
  },
  mapPoint: {
    alignItems: 'center',
    borderRadius: 18,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    width: 34,
  },
  mapPointStart: {
    backgroundColor: neonPalette.cyan,
    left: 22,
    top: 64,
  },
  mapPointEnd: {
    backgroundColor: neonPalette.mint,
    right: 22,
    top: 134,
  },
  etaCard: {
    backgroundColor: 'rgba(5,8,22,0.9)',
    borderColor: 'rgba(245,247,255,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    bottom: 12,
    left: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    position: 'absolute',
  },
  etaLabel: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 8,
  },
  etaValue: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    marginTop: 2,
  },
  mobileStats: {
    flexDirection: 'row',
    gap: 9,
  },
  mobileStat: {
    backgroundColor: 'rgba(245,247,255,0.045)',
    borderColor: 'rgba(245,247,255,0.08)',
    borderRadius: 13,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    padding: 10,
  },
  mobileStatValue: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
  },
  mobileStatLabel: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 8,
  },
  mobileAlert: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,45,122,0.08)',
    borderColor: 'rgba(255,45,122,0.2)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  mobileAlertIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,45,122,0.13)',
    borderRadius: 11,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  mobileAlertCopy: {
    flex: 1,
  },
  mobileAlertTitle: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '900',
  },
  mobileAlertBody: {
    color: neonPalette.mutedStrong,
    fontFamily: Typography.body,
    fontSize: 8,
    lineHeight: 12,
    marginTop: 2,
  },
  visualBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(8,14,34,0.96)',
    borderColor: 'rgba(245,247,255,0.12)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'absolute',
    zIndex: 3,
  },
  visualBadgeTop: {
    right: 0,
    top: 72,
  },
  visualBadgeBottom: {
    bottom: 78,
    left: 0,
  },
  visualBadgeValue: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '900',
  },
  visualBadgeLabel: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 8,
    marginTop: 2,
  },
  contentColumn: {
    flex: 1.08,
    gap: 22,
    minWidth: 0,
  },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(245,247,255,0.045)',
    borderColor: 'rgba(245,247,255,0.1)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 18,
  },
  loadingText: {
    color: neonPalette.mutedStrong,
    fontFamily: Typography.body,
    fontSize: 13,
  },
  versionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 11,
  },
  statusBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  statusDot: {
    borderRadius: 5,
    height: 7,
    width: 7,
  },
  statusText: {
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  versionText: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
  },
  featureList: {
    gap: 10,
  },
  featureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
  },
  featureIcon: {
    alignItems: 'center',
    backgroundColor: neonPalette.cyanSoft,
    borderColor: 'rgba(0,194,255,0.2)',
    borderRadius: 11,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  featureText: {
    color: neonPalette.mutedStrong,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 13.5,
    fontWeight: '700',
  },
  releaseGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  releaseGridStacked: {
    flexDirection: 'column',
  },
  releaseCard: {
    backgroundColor: 'rgba(245,247,255,0.04)',
    borderColor: 'rgba(245,247,255,0.09)',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    padding: 14,
  },
  releaseLabel: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  releaseValue: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  releaseMeta: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 10,
  },
  notesCard: {
    backgroundColor: 'rgba(47,255,213,0.045)',
    borderColor: 'rgba(47,255,213,0.14)',
    borderRadius: 15,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  notesTitle: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 2,
  },
  noteRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  noteText: {
    color: neonPalette.mutedStrong,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 11,
    lineHeight: 16,
  },
  warningRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,138,61,0.07)',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 9,
    padding: 11,
  },
  warningText: {
    color: neonPalette.mutedStrong,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 11,
    lineHeight: 16,
  },
  actionRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 11,
  },
  downloadButton: {
    alignItems: 'center',
    backgroundColor: neonPalette.accent,
    borderColor: neonPalette.accent,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 58,
    paddingHorizontal: 17,
    paddingVertical: 10,
  },
  downloadButtonDisabled: {
    backgroundColor: 'rgba(138,147,178,0.16)',
    borderColor: 'rgba(138,147,178,0.18)',
    opacity: 0.7,
  },
  downloadButtonLabel: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  downloadButtonMeta: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: Typography.body,
    fontSize: 9.5,
    marginTop: 2,
  },
  portalButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(245,247,255,0.05)',
    borderColor: 'rgba(245,247,255,0.14)',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: 17,
  },
  portalButtonText: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 12.5,
    fontWeight: '900',
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ translateY: 1 }],
  },
  qrCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(245,247,255,0.04)',
    borderColor: 'rgba(245,247,255,0.09)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 12,
  },
  qrImageShell: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 7,
  },
  qrImage: {
    height: 78,
    width: 78,
  },
  qrCopy: {
    flex: 1,
    gap: 3,
  },
  qrTitle: {
    color: neonPalette.text,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  qrText: {
    color: neonPalette.muted,
    fontFamily: Typography.body,
    fontSize: 10.5,
    lineHeight: 15,
  },
});