import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { EmptyState } from '@/src/components/ui/empty-state';
import { SkeletonBlock } from '@/src/components/ui/skeleton';
import { useShallow } from 'zustand/react/shallow';
import { PortalLayout } from '../components/portal-layout';
import { usePortalStore } from '../store/use-portal-store';
import { PortalAppAdmin } from '../components/portal-app-admin';
import { useNovidadesScroll } from '../app-mobile/app-mobile.utils';
import { styles } from '../app-mobile/app-mobile.styles';
import { AppMobileHero } from '../app-mobile/components/app-mobile-hero';
import { AppMobileInfoFacts } from '../app-mobile/components/app-mobile-info-facts';
import { AppMobileDownloadCard } from '../app-mobile/components/app-mobile-download-card';
import { AppMobileReleaseNotes } from '../app-mobile/components/app-mobile-release-notes';
import { AppMobileTabBar, type TabKey } from '../app-mobile/components/app-mobile-tab-bar';
import { AppMobileVersionTimeline } from '../app-mobile/components/app-mobile-version-timeline';
import QRCode from 'qrcode';

export function PortalAppMovilScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const { appInfo, error, isLoading, loadAppInfo } = usePortalStore(
    useShallow((state) => ({
      appInfo: state.appInfo,
      error: state.error,
      isLoading: state.isLoading,
      loadAppInfo: state.loadAppInfo,
    }))
  );
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
      <AppMobileHero
        compact={compact}
        appName="ManeComb"
        appStatus={appInfo.status ?? 'Disponible'}
        appVersion={appInfo.version}
        onDownload={handleDownload}
        onNovidades={scrollToNovidades}
      />

      <AppMobileTabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'info' && (
        <>
          <AppMobileInfoFacts
            facts={[
              { icon: 'android', label: 'Versión', value: appInfo.version },
              { icon: 'android', label: 'Android mínimo', value: appInfo.androidMin },
              { icon: 'harddisk', label: 'Tamaño', value: appInfo.size },
              { icon: 'calendar', label: 'Última actualización', value: appInfo.releaseDate },
            ]}
          />

          <AppMobileDownloadCard
            compact={compact}
            qrSvg={qrSvg}
            androidMin={appInfo.androidMin}
            size={appInfo.size}
            version={appInfo.version}
            onDownload={handleDownload}
          />

          <AppMobileReleaseNotes ref={novidadesRef} version={appInfo.version} notes={appInfo.releaseNotes} />
        </>
      )}

      {activeTab === 'history' && appInfo.versionHistory && appInfo.versionHistory.length > 1 && (
        <AppMobileVersionTimeline
          versions={appInfo.versionHistory}
          expandedVersions={expandedVersions}
          onToggleVersion={toggleVersionExpanded}
          onDownload={handleDownload}
          compact={compact}
        />
      )}

      {activeTab === 'admin' && <PortalAppAdmin />}
    </PortalLayout>
  );
}
