import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { AppTheme, Typography } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { SkeletonBlock } from '@/src/components/ui/skeleton';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { BrandLogo } from '@/src/components/brand-logo';
import { PortalLayout } from '../components/portal-layout';
import { usePortalStore } from '../store/use-portal-store';
import { portalButtonGradient, portalGlass, portalPalette } from '../portal-theme';
import { PortalAppAdmin } from '../components/portal-app-admin';
import type { PortalAppVersion } from '../types';
import QRCode from 'qrcode';

type TabKey = 'info' | 'history' | 'admin';

function useNovidadesScroll() {
  const ref = useRef<any>(null);
  const scrollToNovidades = useCallback(() => {
    if (Platform.OS === 'web' && ref.current) {
      const node = ref.current as unknown as HTMLElement;
      const top = node.getBoundingClientRect().top + window.scrollY - 16;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }, []);
  return { ref, scrollToNovidades };
}

export function PortalAppMovilScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const { appInfo, error, isLoading, loadAppInfo } = usePortalStore();
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const { ref: novidadesRef, scrollToNovidades } = useNovidadesScroll();

  const toggleVersionExpanded = useCallback((version: string) => {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(version)) {
        next.delete(version);
      } else {
        next.add(version);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!appInfo) {
      loadAppInfo();
    }
  }, []);

  useEffect(() => {
    if (appInfo?.apkUrl) {
      QRCode.toString(appInfo.apkUrl, {
        type: 'svg',
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' },
      }).then((svg) => setQrSvg(svg));
    }
  }, [appInfo?.apkUrl]);

  const handleDownload = () => {
    if (appInfo?.apkUrl) {
      Linking.openURL(appInfo.apkUrl);
    }
  };

  if (isLoading && !appInfo) {
    return (
      <PortalLayout title="App Móvil" subtitle="Centro de descarga de la aplicación ManeComb para conductores.">
        <View style={styles.skeletonHero}>
          <View style={styles.skeletonHeroLeft}>
            <SkeletonBlock height={30} width={120} />
            <SkeletonBlock height={22} width="60%" />
            <SkeletonBlock height={16} width="40%" />
            <SkeletonBlock height={48} width={180} />
          </View>
          <View style={styles.skeletonPhone}>
            <SkeletonBlock height={260} width={140} />
          </View>
        </View>
      </PortalLayout>
    );
  }

  if (error && !appInfo) {
    return (
      <PortalLayout title="App Móvil" subtitle="Centro de descarga de la aplicación ManeComb para conductores.">
        <View style={styles.errorState}>
          <EmptyState
            icon="cloud-alert"
            title="No pudimos cargar la información"
            description={error}
          />
          <Pressable accessibilityRole="button" onPress={loadAppInfo} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </Pressable>
        </View>
      </PortalLayout>
    );
  }

  if (!appInfo) {
    return (
      <PortalLayout title="App Móvil" subtitle="Centro de descarga de la aplicación ManeComb para conductores.">
        <EmptyState
          icon="cellphone-remove"
          title="No hay información disponible"
          description="No se encontraron datos de la aplicación móvil."
        />
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="App Móvil" subtitle="Centro de descarga de la aplicación ManeComb para conductores.">
      <View style={styles.heroCard}>
        <View style={[compact ? styles.heroBodyCompact : styles.heroBody]}>
          <View style={styles.heroLeft}>
            <BrandLogo size="sm" plain />
            <Text style={styles.heroTitle}>ManeComb</Text>
            <Text style={styles.heroDesc}>La aplicación oficial para conductores</Text>
            <View style={styles.heroBadgeRow}>
              <View style={styles.heroBadgeAvailable}>
                <MaterialCommunityIcons name="check-circle" size={14} color={portalPalette.success} />
                <Text style={styles.heroBadgeText}>{appInfo.status ?? 'Disponible'}</Text>
              </View>
              <Text style={styles.heroVersionBadge}>v{appInfo.version}</Text>
            </View>
            <View style={styles.heroActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Descargar APK de ManeComb"
                onPress={handleDownload}
                style={[styles.dlButton, portalButtonGradient()]}>
                <MaterialCommunityIcons name="download" size={20} color="#FFFFFF" />
                <Text style={styles.dlButtonText}>Descargar APK</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ver novedades de esta versión"
                onPress={scrollToNovidades}
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

      <View style={styles.tabBar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setActiveTab('info')}
          style={[styles.tabItem, activeTab === 'info' && styles.tabItemActive]}>
          <MaterialCommunityIcons
            name="information-outline"
            size={16}
            color={activeTab === 'info' ? portalPalette.accent : portalPalette.muted}
          />
          <Text style={[styles.tabText, activeTab === 'info' && styles.tabTextActive]}>Información</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setActiveTab('history')}
          style={[styles.tabItem, activeTab === 'history' && styles.tabItemActive]}>
          <MaterialCommunityIcons
            name="history"
            size={16}
            color={activeTab === 'history' ? portalPalette.accent : portalPalette.muted}
          />
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>Historial</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setActiveTab('admin')}
          style={[styles.tabItem, activeTab === 'admin' && styles.tabItemActive]}>
          <MaterialCommunityIcons
            name="cog-outline"
            size={16}
            color={activeTab === 'admin' ? portalPalette.accent : portalPalette.muted}
          />
          <Text style={[styles.tabText, activeTab === 'admin' && styles.tabTextActive]}>Administración</Text>
        </Pressable>
      </View>

      {activeTab === 'info' && (
        <>
          <View style={styles.infoRow}>
            <InfoFact icon="android" label="Versión" value={appInfo.version} />
            <InfoFact icon="android" label="Android mínimo" value={appInfo.androidMin} />
            <InfoFact icon="harddisk" label="Tamaño" value={appInfo.size} />
            <InfoFact icon="calendar" label="Última actualización" value={appInfo.releaseDate} />
          </View>

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
                  <Text style={styles.metaPillText}>Android {appInfo.androidMin}+</Text>
                </View>
                <View style={styles.metaPill}>
                  <MaterialCommunityIcons name="harddisk" size={14} color={portalPalette.info} />
                  <Text style={styles.metaPillText}>{appInfo.size}</Text>
                </View>
                <View style={styles.metaPill}>
                  <MaterialCommunityIcons name="tag-text-outline" size={14} color={portalPalette.info} />
                  <Text style={styles.metaPillText}>v{appInfo.version}</Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Descargar APK de ManeComb"
                onPress={handleDownload}
                style={[styles.dlButtonLarge, portalButtonGradient()]}>
                <MaterialCommunityIcons name="download" size={22} color="#FFFFFF" />
                <Text style={styles.dlButtonLargeText}>Descargar APK</Text>
              </Pressable>
            </View>
          </View>

          {appInfo.releaseNotes.length > 0 && (
            <View ref={novidadesRef} style={styles.novidadesCard}>
              <Text style={styles.novidadesTitle}>¿Qué incluye esta versión?</Text>
              <Text style={styles.novidadesSubtitle}>Novedades y mejoras de ManeComb v{appInfo.version}</Text>
              <View style={styles.novidadesList}>
                {appInfo.releaseNotes.map((note, index) => (
                  <View key={index} style={styles.novidadeItem}>
                    <View style={styles.novidadeCheckIcon}>
                      <MaterialCommunityIcons name="check" size={16} color={portalPalette.success} />
                    </View>
                    <Text style={styles.novidadeText}>{note}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </>
      )}

      {activeTab === 'history' && appInfo.versionHistory && appInfo.versionHistory.length > 1 && (
        <View style={styles.timelineCard}>
          <Text style={styles.timelineTitle}>Historial de versiones</Text>
          <Text style={styles.timelineSubtitle}>Todas las publicaciones de ManeComb</Text>
          <View style={styles.timelineList}>
            {appInfo.versionHistory.map((ver, index) => (
              <VersionTimelineItem
                key={ver.version}
                ver={ver}
                isFirst={index === 0}
                isLast={index === appInfo.versionHistory!.length - 1}
                expanded={expandedVersions.has(ver.version)}
                onToggle={() => toggleVersionExpanded(ver.version)}
                onDownload={ver.current ? handleDownload : undefined}
                compact={compact}
              />
            ))}
          </View>
        </View>
      )}

      {activeTab === 'admin' && <PortalAppAdmin />}
    </PortalLayout>
  );
}

function InfoFact({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.infoFactCard}>
      <View style={styles.infoFactIconWrap}>
        <MaterialCommunityIcons name={icon} size={22} color={portalPalette.info} />
      </View>
      <Text style={styles.infoFactLabel}>{label}</Text>
      <Text style={styles.infoFactValue}>{value}</Text>
    </View>
  );
}

function VersionTimelineItem({
  ver,
  isFirst,
  isLast,
  expanded,
  onToggle,
  onDownload,
  compact,
}: {
  ver: PortalAppVersion;
  isFirst: boolean;
  isLast: boolean;
  expanded: boolean;
  onToggle: () => void;
  onDownload?: () => void;
  compact: boolean;
}) {
  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineLine}>
        <View style={[styles.timelineDot, ver.current ? styles.timelineDotCurrent : styles.timelineDotPast]} />
        {!isLast && <View style={styles.timelineConnector} />}
      </View>
      <View style={[styles.timelineContent, compact ? styles.timelineContentCompact : undefined]}>
        <View style={styles.timelineHeader}>
          <View style={styles.timelineVersionWrap}>
            <Text style={styles.timelineVersion}>v{ver.version}</Text>
            <Text style={styles.timelineDate}>{ver.date}</Text>
          </View>
          <View style={styles.timelineBadgeWrap}>
            {ver.current && <StatusBadge label="ACTUAL" tone="positive" />}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Contraer notas' : 'Expandir notas'}
              onPress={onToggle}
              style={styles.expandButton}>
              <MaterialCommunityIcons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={portalPalette.muted}
              />
            </Pressable>
          </View>
        </View>
        <View style={styles.timelineMeta}>
          <View style={styles.metaPill}>
            <MaterialCommunityIcons name="android" size={12} color={portalPalette.info} />
            <Text style={styles.metaPillSmall}>{ver.androidMin}</Text>
          </View>
          <View style={styles.metaPill}>
            <MaterialCommunityIcons name="harddisk" size={12} color={portalPalette.info} />
            <Text style={styles.metaPillSmall}>{ver.size}</Text>
          </View>
        </View>
        {expanded && ver.notes.length > 0 && (
          <View style={styles.timelineNotes}>
            {ver.notes.map((note, i) => (
              <View key={i} style={styles.noteRow}>
                <MaterialCommunityIcons name="check-circle-outline" size={15} color={portalPalette.success} />
                <Text style={styles.noteText}>{note}</Text>
              </View>
            ))}
          </View>
        )}
        {onDownload && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Descargar APK de esta versión"
            onPress={onDownload}
            style={[styles.timelineDlButton, portalButtonGradient()]}>
            <MaterialCommunityIcons name="download" size={16} color="#FFFFFF" />
            <Text style={styles.timelineDlButtonText}>Descargar APK</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonHero: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    justifyContent: 'space-between',
  },
  skeletonHeroLeft: {
    flex: 1,
    flexBasis: 300,
    gap: 14,
    minWidth: 0,
  },
  skeletonPhone: {
    alignItems: 'center',
    flexShrink: 0,
  },
  errorState: {
    alignItems: 'center',
    gap: 12,
  },
  retryButton: {
    alignItems: 'center',
    borderColor: portalPalette.lineStrong,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 18,
  },
  retryButtonText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  heroCard: {
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    minWidth: 0,
    overflow: 'hidden',
    padding: AppTheme.spacing.lg,
    ...portalGlass(),
  },
  heroBody: {
    flexDirection: 'row',
    gap: 32,
    justifyContent: 'space-between',
  },
  heroBodyCompact: {
    flexDirection: 'column',
    gap: 24,
  },
  heroLeft: {
    flex: 1,
    flexBasis: 340,
    gap: 10,
    justifyContent: 'center',
    minWidth: 0,
  },
  heroTitle: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 38,
  },
  heroDesc: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 420,
  },
  heroBadgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  heroBadgeAvailable: {
    alignItems: 'center',
    backgroundColor: portalPalette.successSoft,
    borderRadius: AppTheme.radius.pill,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroBadgeText: {
    color: portalPalette.success,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  heroVersionBadge: {
    color: portalPalette.mutedSoft,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '700',
  },
  heroActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  dlButton: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 180,
    paddingHorizontal: 22,
  },
  dlButtonText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 15,
    fontWeight: '900',
  },
  novidadesButton: {
    alignItems: 'center',
    borderColor: portalPalette.lineStrong,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  novidadesButtonText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  phoneFrame: {
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 28,
    flexShrink: 0,
    height: 280,
    justifyContent: 'center',
    padding: 6,
    width: 148,
  },
  phoneNotch: {
    backgroundColor: '#1A1A1A',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    height: 20,
    position: 'absolute',
    top: 6,
    width: 80,
    zIndex: 2,
  },
  phoneScreen: {
    backgroundColor: '#121821',
    borderRadius: 22,
    flex: 1,
    overflow: 'hidden',
    width: '100%',
  },
  phoneStatusBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  phoneStatusText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '700',
  },
  phoneStatusIcons: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  phoneAppContent: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    justifyContent: 'center',
  },
  phoneAppName: {
    color: '#FFFFFF',
    fontFamily: Typography.display,
    fontSize: 14,
    fontWeight: '900',
  },
  phoneAppDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: Typography.body,
    fontSize: 10,
  },
  phoneNavBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoFactCard: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flex: 1,
    flexBasis: 160,
    gap: 4,
    minWidth: 0,
    padding: AppTheme.spacing.md,
  },
  infoFactIconWrap: {
    alignItems: 'center',
    backgroundColor: portalPalette.infoSoft,
    borderRadius: 10,
    height: 38,
    justifyContent: 'center',
    marginBottom: 4,
    width: 38,
  },
  infoFactLabel: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 11,
  },
  infoFactValue: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
  },
  downloadCard: {
    alignItems: 'center',
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 28,
    minWidth: 0,
    padding: AppTheme.spacing.lg,
    ...portalGlass(),
  },
  downloadCardCompact: {
    flexDirection: 'column',
    gap: 20,
  },
  qrWrap: {
    alignItems: 'center',
    flexShrink: 0,
    gap: 8,
  },
  qrLoading: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderRadius: AppTheme.radius.sm,
    height: 140,
    justifyContent: 'center',
    width: 140,
  },
  qrHint: {
    color: portalPalette.mutedSoft,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  downloadInfoWrap: {
    flex: 1,
    flexBasis: 260,
    gap: 12,
    minWidth: 0,
  },
  downloadTitle: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 20,
    fontWeight: '900',
  },
  downloadSubtitle: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
  },
  downloadMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaPill: {
    alignItems: 'center',
    backgroundColor: portalPalette.infoSoft,
    borderRadius: AppTheme.radius.pill,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metaPillText: {
    color: portalPalette.info,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
  dlButtonLarge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 52,
    minWidth: 200,
    paddingHorizontal: 24,
  },
  dlButtonLargeText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 16,
    fontWeight: '900',
  },
  novidadesCard: {
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    gap: 8,
    minWidth: 0,
    padding: AppTheme.spacing.lg,
    ...portalGlass(),
  },
  novidadesTitle: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 20,
    fontWeight: '900',
  },
  novidadesSubtitle: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 19,
  },
  novidadesList: {
    gap: 8,
    marginTop: 4,
  },
  novidadeItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  novidadeCheckIcon: {
    alignItems: 'center',
    backgroundColor: portalPalette.successSoft,
    borderRadius: 12,
    flexShrink: 0,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  novidadeText: {
    color: portalPalette.text,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 14,
    lineHeight: 20,
    minWidth: 0,
  },
  timelineCard: {
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    gap: 10,
    minWidth: 0,
    padding: AppTheme.spacing.lg,
    ...portalGlass(),
  },
  timelineTitle: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 20,
    fontWeight: '900',
  },
  timelineSubtitle: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 19,
  },
  timelineList: {
    gap: 0,
    marginTop: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 12,
    minWidth: 0,
  },
  timelineLine: {
    alignItems: 'center',
    flexShrink: 0,
    width: 24,
  },
  timelineDot: {
    borderRadius: 10,
    height: 10,
    marginTop: 6,
    width: 10,
  },
  timelineDotCurrent: {
    backgroundColor: portalPalette.accent,
  },
  timelineDotPast: {
    backgroundColor: portalPalette.mutedSoft,
  },
  timelineConnector: {
    flex: 1,
    width: 2,
    backgroundColor: portalPalette.line,
    minHeight: 20,
  },
  timelineContent: {
    flex: 1,
    flexBasis: 200,
    gap: 8,
    minWidth: 0,
    paddingBottom: 24,
  },
  timelineContentCompact: {
    paddingBottom: 18,
  },
  timelineHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  timelineVersionWrap: {
    gap: 2,
    minWidth: 0,
  },
  timelineVersion: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 17,
    fontWeight: '900',
  },
  timelineDate: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
  },
  timelineBadgeWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
  },
  expandButton: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  timelineMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaPillSmall: {
    color: portalPalette.info,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
  },
  timelineNotes: {
    backgroundColor: portalPalette.surfaceSoft,
    borderRadius: AppTheme.radius.sm,
    gap: 6,
    padding: AppTheme.spacing.sm,
  },
  noteRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 7,
  },
  noteText: {
    color: portalPalette.text,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
    minWidth: 0,
  },
  timelineDlButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 16,
  },
  timelineDlButtonText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  tabBar: {
    borderBottomColor: portalPalette.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 0,
    minWidth: 0,
  },
  tabItem: {
    alignItems: 'center',
    borderBottomColor: 'transparent',
    borderBottomWidth: 2,
    flexDirection: 'row',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 16,
  },
  tabItemActive: {
    borderBottomColor: portalPalette.accent,
  },
  tabText: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
  },
  tabTextActive: {
    color: portalPalette.accent,
  },
});
