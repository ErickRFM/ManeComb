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
  const [qrError, setQrError] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const { ref: novidadesRef, scrollToNovidades } = useNovidadesScroll();

  const toggleVersionExpanded = useCallback((version: string) => {
    setExpandedVersions((previous) => {
      const next = new Set(previous);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!appInfo && !isLoading) {
      void loadAppInfo();
    }
  }, [appInfo, isLoading, loadAppInfo]);

  useEffect(() => {
    let cancelled = false;
    setQrSvg(null);
    setQrError(false);

    if (!appInfo?.apkUrl) return () => { cancelled = true; };

    void QRCode.toString(appInfo.apkUrl, {
      type: 'svg',
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' },
    })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setQrError(true);
      });

    return () => { cancelled = true; };
  }, [appInfo?.apkUrl]);

  const handleDownload = async () => {
    setDownloadMessage(null);
    if (!appInfo?.apkUrl) {
      setDownloadMessage('La descarga todavía no está disponible.');
      return;
    }

    try {
      await Linking.openURL(appInfo.apkUrl);
    } catch {
      setDownloadMessage('No fue posible abrir la descarga. Revisa el enlace publicado e intenta nuevamente.');
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
          <EmptyState icon="cloud-alert" title="No pudimos cargar la información" description={error} />
          <Pressable accessibilityRole="button" onPress={() => void loadAppInfo()} style={styles.retryButton}>
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

  const versionHistory = appInfo.versionHistory || [];

  return (
    <PortalLayout title="App Móvil" subtitle="Descarga, requisitos, versión publicada y administración del APK para conductores.">
      <AppMobileHero
        compact={compact}
        appName="ManeComb"
        appStatus={appInfo.status ?? 'Disponible'}
        appVersion={appInfo.version}
        onDownload={() => void handleDownload()}
        onNovidades={scrollToNovidades}
      />

      {downloadMessage ? (
        <View style={styles.errorState}>
          <Text style={styles.retryButtonText}>{downloadMessage}</Text>
        </View>
      ) : null}

      <AppMobileTabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'info' ? (
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
            qrSvg={qrError ? null : qrSvg}
            androidMin={appInfo.androidMin}
            size={appInfo.size}
            version={appInfo.version}
            onDownload={() => void handleDownload()}
          />

          {qrError ? (
            <EmptyState
              icon="qrcode-remove"
              title="No se pudo generar el QR"
              description="La descarga directa sigue disponible desde el botón."
            />
          ) : null}

          <AppMobileReleaseNotes ref={novidadesRef} version={appInfo.version} notes={appInfo.releaseNotes} />
        </>
      ) : null}

      {activeTab === 'history' ? (
        versionHistory.length > 1 ? (
          <AppMobileVersionTimeline
            versions={versionHistory}
            expandedVersions={expandedVersions}
            onToggleVersion={toggleVersionExpanded}
            onDownload={() => void handleDownload()}
            compact={compact}
          />
        ) : (
          <EmptyState
            icon="history"
            title="Aún no hay versiones anteriores"
            description={`La versión ${appInfo.version} es la única publicación disponible en este momento.`}
          />
        )
      ) : null}

      {activeTab === 'admin' ? <PortalAppAdmin /> : null}
    </PortalLayout>
  );
}
