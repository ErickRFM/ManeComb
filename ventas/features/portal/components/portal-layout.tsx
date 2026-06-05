import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Redirect, router, useLocalSearchParams, usePathname } from '@/src/navigation/router';
import { useEffect, useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { BrandLogo } from '@/src/components/brand-logo';
import { ToastProvider } from '@/src/components/ui/toast';
import { portalGlass, portalPalette } from '../portal-theme';
import { usePortalStore } from '../store/use-portal-store';
import { useAppStore } from '@/src/store/use-app-store';
import { canAccessPortal, canOpenOperationalPanel } from '../utils/access';

type PortalLayoutProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}>;

type PortalNavItem = {
  label: string;
  href:
    | '/portal'
    | '/portal/usuarios'
    | '/portal/plan'
    | '/portal/facturacion'
    | '/portal/pagos'
    | '/portal/perfil'
    | '/portal/onboarding'
    | '/mapa';
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  section?: string;
};

const navSections: { title: string; items: PortalNavItem[] }[] = [
  {
    title: 'Portal comercial',
    items: [
      { label: 'Inicio', href: '/portal', icon: 'view-dashboard-outline' },
      { label: 'Suscripcion', href: '/portal/plan', icon: 'clipboard-list-outline' },
      { label: 'Facturacion', href: '/portal/facturacion', icon: 'file-document-outline' },
      { label: 'Metodos de pago', href: '/portal/pagos', icon: 'credit-card-outline' },
    ],
  },
  {
    title: 'Administracion',
    items: [
      { label: 'Seguridad', href: '/portal/perfil', icon: 'shield-lock-outline', section: 'seguridad' },
      { label: 'Equipo administrativo', href: '/portal/usuarios', icon: 'account-key-outline', section: 'administracion' },
      { label: 'Empresa', href: '/portal/perfil', icon: 'domain', section: 'empresa' },
      { label: 'Integraciones', href: '/portal/perfil', icon: 'connection', section: 'integraciones' },
    ],
  },
  {
    title: 'Activacion y ayuda',
    items: [
      { label: 'Activacion', href: '/portal/onboarding', icon: 'flag-checkered' },
      { label: 'Soporte', href: '/portal/perfil', icon: 'lifebuoy', section: 'soporte' },
    ],
  },
];

const operationalPanelItem: PortalNavItem = {
  label: 'Ir al panel operativo',
  href: '/mapa',
  icon: 'map-marker-radius-outline',
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isActive(pathname: string, href: string, currentSection?: string, itemSection?: string) {
  if (itemSection) {
    return pathname.startsWith(href) && currentSection === itemSection;
  }

  if (href === '/portal') {
    return pathname === '/portal' || pathname === '/portal/';
  }

  return pathname.startsWith(href);
}

export function PortalLayout({ title, subtitle, actions, children }: PortalLayoutProps) {
  const { width } = useWindowDimensions();
  const isWide = width >= 980;
  const pathname = usePathname();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const currentSection = getParam(params.section);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { setThemeMode, signOut, user } = useAppStore(
    useShallow((state) => ({
      setThemeMode: state.setThemeMode,
      signOut: state.signOut,
      user: state.user,
    }))
  );
  const { clearError, error, loadAll, subscription } = usePortalStore(
    useShallow((state) => ({
      clearError: state.clearError,
      error: state.error,
      loadAll: state.loadAll,
      subscription: state.subscription,
    }))
  );
  const showOperationalPanel = canOpenOperationalPanel(subscription, user);

  useEffect(() => {
    if (user) {
      void setThemeMode('dark');
      void loadAll();
    }
  }, [loadAll, setThemeMode, user]);

  if (!user) {
    return <Redirect href={'/ventas/login' as never} />;
  }

  if (!canAccessPortal(user)) {
    return <Redirect href={'/mapa' as never} />;
  }

  const goToItem = (item: PortalNavItem) => {
    setMobileMenuOpen(false);
    router.push(
      item.section
        ? ({
            pathname: item.href,
            params: { section: item.section },
          } as never)
        : (item.href as never)
    );
  };

  const renderNavItem = (item: PortalNavItem, variant: 'desktop' | 'mobile' = 'desktop') => {
    const active = isActive(pathname, item.href, currentSection, item.section);
    const itemStyle = variant === 'desktop' ? styles.navItem : styles.mobileNavItem;
    const activeStyle = variant === 'desktop' ? styles.navItemActive : styles.mobileNavItemActive;
    const textStyle = variant === 'desktop' ? styles.navText : styles.mobileNavText;

    return (
      <Pressable
        key={`${item.href}-${item.label}-${item.section || 'root'}`}
        onPress={() => goToItem(item)}
        style={[itemStyle, active ? activeStyle : undefined]}>
        <MaterialCommunityIcons
          name={item.icon}
          size={variant === 'desktop' ? 19 : 18}
          color={active ? portalPalette.accent : portalPalette.muted}
        />
        <Text
          style={[
            textStyle,
            {
              color: active ? '#FFFFFF' : portalPalette.text,
            },
          ]}
          numberOfLines={2}>
          {item.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.portalBg} />
      <View style={styles.bgGlowTop} />
      <View style={styles.bgGlowBottom} />
      <View style={[styles.shell, isWide ? styles.shellWide : styles.shellStack]}>
        {isWide ? (
          <View style={[styles.sidebar, portalGlass()]}>
            <Pressable onPress={() => router.push('/ventas')} style={styles.logoButton}>
              <BrandLogo tone="light" size="md" plain />
            </Pressable>
            <ScrollView
              style={styles.sidebarScroll}
              contentContainerStyle={styles.sidebarScrollContent}
              showsVerticalScrollIndicator={false}>
              <View style={styles.contextBlock}>
                <Text style={styles.contextKicker}>Cuenta SaaS</Text>
                <Text style={styles.contextTitle}>Portal comercial</Text>
                <Text style={styles.contextBody}>Plan, pagos, facturacion y administracion de empresa.</Text>
              </View>
              <View style={styles.navList}>
                {navSections.map((section) => (
                  <View key={section.title} style={styles.navSection}>
                    <Text style={styles.navSectionTitle}>{section.title}</Text>
                    {section.items.map((item) => renderNavItem(item))}
                  </View>
                ))}
              </View>
              {showOperationalPanel ? <View style={styles.operationsCard}>
                <View style={styles.operationsIcon}>
                  <MaterialCommunityIcons name="bus-marker" size={20} color={portalPalette.info} />
                </View>
                <View style={styles.operationsCopy}>
                  <Text style={styles.operationsTitle}>Panel operativo</Text>
                  <Text style={styles.operationsBody}>Mapa, flotilla, rutas, radio e incidencias.</Text>
                </View>
                <Pressable onPress={() => goToItem(operationalPanelItem)} style={styles.operationsButton}>
                  <Text style={styles.operationsButtonText}>Abrir</Text>
                  <MaterialCommunityIcons name="arrow-right" size={16} color="#FFFFFF" />
                </Pressable>
              </View> : null}
            </ScrollView>
            <Pressable
              onPress={() => void signOut()}
              style={styles.logoutButton}>
              <MaterialCommunityIcons name="logout" size={20} color={portalPalette.danger} />
              <Text style={styles.logoutText}>Cerrar sesion</Text>
            </Pressable>
          </View>
        ) : null}

        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={[styles.content, !isWide ? styles.contentCompact : undefined]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {!isWide ? (
            <View style={styles.mobileTop}>
              <Pressable
                onPress={() => setMobileMenuOpen((current) => !current)}
                style={styles.iconButton}>
                <MaterialCommunityIcons
                  name={mobileMenuOpen ? 'close' : 'menu'}
                  size={22}
                  color={portalPalette.text}
                />
              </Pressable>
              <Pressable onPress={() => router.push('/ventas')} style={styles.logoButton}>
                <BrandLogo tone="light" size="sm" plain />
              </Pressable>
              <Pressable
                onPress={() => void signOut()}
                style={styles.iconButton}>
                <MaterialCommunityIcons name="logout" size={20} color={portalPalette.danger} />
              </Pressable>
            </View>
          ) : null}

          {!isWide && mobileMenuOpen ? (
            <View style={styles.mobileMenu}>
              {navSections.map((section) => (
                <View key={section.title} style={styles.mobileNavSection}>
                  <Text style={styles.navSectionTitle}>{section.title}</Text>
                  <View style={styles.mobileNavGrid}>{section.items.map((item) => renderNavItem(item, 'mobile'))}</View>
                </View>
              ))}
              {showOperationalPanel ? <Pressable
                onPress={() => goToItem(operationalPanelItem)}
                style={[styles.mobileNavItem, styles.mobileOperationalItem]}>
                <MaterialCommunityIcons name={operationalPanelItem.icon} size={18} color={portalPalette.info} />
                <Text style={[styles.mobileNavText, { color: portalPalette.text }]}>
                  {operationalPanelItem.label}
                </Text>
              </Pressable> : null}
            </View>
          ) : null}

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {actions ? <View style={styles.actions}>{actions}</View> : null}
          </View>

          <ToastProvider message={error} tone="danger" onDismiss={clearError} />
          {children}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: portalPalette.background,
    overflow: 'hidden',
  },
  portalBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: portalPalette.background,
  },
  bgGlowTop: {
    position: 'absolute',
    top: -190,
    right: -180,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: 'rgba(240, 68, 95, 0.1)',
  },
  bgGlowBottom: {
    position: 'absolute',
    left: -190,
    bottom: -210,
    width: 480,
    height: 480,
    borderRadius: 240,
    backgroundColor: 'rgba(35, 213, 255, 0.055)',
  },
  shell: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    width: '100%',
  },
  shellWide: {
    flexDirection: 'row',
  },
  shellStack: {
    flexDirection: 'column',
  },
  sidebar: {
    borderColor: portalPalette.line,
    borderRightWidth: 1,
    flexShrink: 0,
    gap: 14,
    margin: 14,
    marginRight: 0,
    minHeight: 0,
    overflow: 'hidden',
    padding: 16,
    width: 272,
    borderRadius: 16,
  },
  logoButton: {
    alignItems: 'center',
    flexShrink: 0,
  },
  sidebarScroll: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  sidebarScrollContent: {
    gap: 14,
    paddingBottom: 2,
  },
  navList: {
    gap: 14,
  },
  contextBlock: {
    backgroundColor: 'rgba(255, 255, 255, 0.045)',
    borderColor: portalPalette.line,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  contextKicker: {
    color: portalPalette.accent,
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  contextTitle: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 15,
    fontWeight: '900',
  },
  contextBody: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 17,
  },
  navSection: {
    gap: 6,
  },
  navSectionTitle: {
    color: portalPalette.mutedSoft,
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 4,
    textTransform: 'uppercase',
  },
  navItem: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 10,
    borderWidth: 1,
    flexShrink: 0,
    flexDirection: 'row',
    gap: 10,
    minHeight: 40,
    minWidth: 0,
    paddingHorizontal: 12,
  },
  navItemActive: {
    backgroundColor: portalPalette.accentSoft,
    borderColor: 'rgba(255, 77, 125, 0.32)',
  },
  navText: {
    flex: 1,
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 16,
    minWidth: 0,
  },
  operationsCard: {
    backgroundColor: 'rgba(35, 213, 255, 0.075)',
    borderColor: 'rgba(35, 213, 255, 0.18)',
    borderRadius: 14,
    borderWidth: 1,
    flexShrink: 0,
    gap: 10,
    padding: 12,
  },
  operationsIcon: {
    alignItems: 'center',
    backgroundColor: portalPalette.infoSoft,
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  operationsCopy: {
    gap: 3,
    minWidth: 0,
  },
  operationsTitle: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  operationsBody: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 17,
  },
  operationsButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: portalPalette.info,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 11,
  },
  operationsButtonText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  logoutButton: {
    alignItems: 'center',
    backgroundColor: portalPalette.dangerSoft,
    borderColor: 'rgba(255, 90, 122, 0.32)',
    borderRadius: 10,
    borderWidth: 1,
    flexShrink: 0,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  logoutText: {
    color: portalPalette.danger,
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
    flexShrink: 1,
  },
  contentScroll: {
    flex: 1,
    minWidth: 0,
  },
  content: {
    alignSelf: 'center',
    gap: AppTheme.spacing.lg,
    flexGrow: 1,
    maxWidth: 1240,
    padding: 28,
    paddingBottom: 40,
    width: '100%',
  },
  contentCompact: {
    paddingBottom: AppTheme.spacing.xl,
    paddingHorizontal: AppTheme.spacing.md,
    paddingTop: AppTheme.spacing.md,
  },
  mobileTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    minWidth: 0,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: 12,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  mobileMenu: {
    backgroundColor: portalPalette.surface,
    borderColor: portalPalette.line,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    maxWidth: '100%',
    padding: 12,
  },
  mobileNavSection: {
    gap: 7,
    width: '100%',
  },
  mobileNavGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mobileNavItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: portalPalette.line,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    flexBasis: 150,
    minHeight: 40,
    minWidth: 0,
    paddingHorizontal: 11,
    flexGrow: 1,
  },
  mobileNavItemActive: {
    backgroundColor: portalPalette.accentSoft,
    borderColor: 'rgba(255, 77, 125, 0.38)',
  },
  mobileNavText: {
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 16,
    minWidth: 0,
  },
  mobileOperationalItem: {
    backgroundColor: 'rgba(35, 213, 255, 0.08)',
    borderColor: 'rgba(35, 213, 255, 0.2)',
    flexBasis: '100%',
    width: '100%',
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  headerText: {
    flex: 1,
    flexBasis: 260,
    minWidth: 0,
  },
  title: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
  },
  subtitle: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
  },
  actions: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexWrap: 'wrap',
    flexShrink: 1,
    gap: 10,
    justifyContent: 'flex-end',
    maxWidth: '100%',
  },
});
