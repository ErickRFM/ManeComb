import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Redirect, router, useLocalSearchParams, usePathname } from '@/src/navigation/router';
import { useEffect, useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardSafeScrollView } from '@/src/components/keyboard-safe-layout';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { transition, fadeInUp } from '@/src/native/motion';
import { BrandLogo } from '@/src/components/brand-logo';
import { Toast } from '@/src/components/ui/toast';
import { portalGlass, portalPalette } from '../portal-theme';
import { usePortalStore } from '../store/use-portal-store';
import { useAppStore } from '@/src/store/use-app-store';
import { canAccessPortal, hasPortalPermission, type PortalPermission } from '../utils/access';

type PortalLayoutProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  compact?: boolean;
  wide?: boolean;
}>;

type PortalNavItem = {
  label: string;
  href:
    | '/portal'
    | '/portal/usuarios'
    | '/portal/unidades'
    | '/portal/rutas'
    | '/portal/plan'
    | '/portal/facturacion'
    | '/portal/pagos'
    | '/portal/perfil'
    | '/portal/onboarding'
    | '/portal/documentos'
    | '/portal/incidencias';
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  section?: string;
  permission?: PortalPermission;
};

const navSections: { title: string; items: PortalNavItem[] }[] = [
  {
    title: 'Cuenta',
    items: [
      { label: 'Operaciones', href: '/portal', icon: 'view-dashboard-outline' },
      { label: 'Mi plan', href: '/portal/plan', icon: 'clipboard-list-outline', permission: 'billing' },
      { label: 'Facturación', href: '/portal/facturacion', icon: 'file-document-outline', permission: 'billing' },
      { label: 'Pagos', href: '/portal/pagos', icon: 'credit-card-outline', permission: 'billing' },
    ],
  },
  {
    title: 'Administración',
    items: [
      { label: 'Empresa', href: '/portal/perfil', icon: 'domain', section: 'empresa' },
      { label: 'Equipo', href: '/portal/usuarios', icon: 'account-key-outline', section: 'administracion', permission: 'users' },
      { label: 'Unidades', href: '/portal/unidades', icon: 'bus-multiple', permission: 'vehicles' },
      { label: 'Rutas', href: '/portal/rutas', icon: 'routes', permission: 'routes' },
      { label: 'Seguridad', href: '/portal/perfil', icon: 'shield-lock-outline', section: 'seguridad' },
      { label: 'Documentos', href: '/portal/documentos', icon: 'file-document-multiple-outline', permission: 'billing' },
      { label: 'Incidencias', href: '/portal/incidencias', icon: 'alert-circle-outline', permission: 'billing' },
    ],
  },
  {
    title: 'Ayuda',
    items: [
      { label: 'Activación', href: '/portal/onboarding', icon: 'flag-checkered' },
      { label: 'Soporte', href: '/portal/perfil', icon: 'lifebuoy', section: 'soporte' },
    ],
  },
];

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

export function PortalLayout({ title, subtitle, actions, children, compact = false, wide = false }: PortalLayoutProps) {
  const { width } = useWindowDimensions();
  const isWide = width >= 980;
  const isWeb = Platform.OS === 'web';
  const pathname = usePathname();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const currentSection = getParam(params.section);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { signOut, user } = useAppStore(
    useShallow((state) => ({
      signOut: state.signOut,
      user: state.user,
    }))
  );
  const { clearError, error, loadAll } = usePortalStore(
    useShallow((state) => ({
      clearError: state.clearError,
      error: state.error,
      loadAll: state.loadAll,
    }))
  );

  // Depende del id y no del objeto: el usuario se reemplaza en cada refresh de
  // sesion y volvia a disparar la carga completa del portal.
  const userId = user?.id;

  useEffect(() => {
    if (userId) {
      void loadAll();
    }
  }, [loadAll, userId]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = title ? `ManeComb — ${title}` : 'ManeComb';
    }
  }, [title]);

  if (!user) {
    return <Redirect href={'/ventas/login' as never} />;
  }

  if (!canAccessPortal(user)) {
    return <Redirect href={'/ventas' as never} />;
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
        accessibilityRole="button"
        accessibilityLabel={`Abrir ${item.label}`}
        accessibilityState={{ selected: active }}
        style={({ hovered, pressed }: any) => [
          itemStyle,
          active ? activeStyle : undefined,
          transition('background-color, border-color, transform', 160),
          !active && hovered ? styles.navItemHover : undefined,
          pressed ? styles.navItemPressed : undefined,
        ]}>
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

  const contentBody = (
    <>
      {!isWide ? (
        <View nativeID="portal-mobile-top" style={styles.mobileTop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            accessibilityState={{ expanded: mobileMenuOpen }}
            onPress={() => setMobileMenuOpen((current) => !current)}
            style={styles.iconButton}>
            <MaterialCommunityIcons
              name={mobileMenuOpen ? 'close' : 'menu'}
              size={22}
              color={portalPalette.text}
            />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Volver a ventas" onPress={() => router.push('/ventas')} style={styles.logoButton}>
            <BrandLogo tone="light" size="sm" plain />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar sesión"
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
              <View style={styles.mobileNavGrid}>{section.items.filter((item) => !item.permission || hasPortalPermission(user, item.permission)).map((item) => renderNavItem(item, 'mobile'))}</View>
            </View>
          ))}
        </View>
      ) : null}

      <View nativeID="portal-header" style={[styles.header, fadeInUp(0)]}>
        <View nativeID="portal-header-text" style={styles.headerText}>
          <View nativeID="portal-breadcrumb" style={styles.breadcrumb}>
            <Pressable accessibilityRole="link" onPress={() => router.push('/portal' as never)}>
              <Text style={styles.breadcrumbMuted}>Portal</Text>
            </Pressable>
            <MaterialCommunityIcons name="chevron-right" size={14} color={portalPalette.mutedSoft} />
            <Text style={styles.breadcrumbCurrent}>{title}</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {actions ? <View nativeID="portal-header-actions" style={styles.actions}>{actions}</View> : null}
      </View>

      <Toast message={error} tone="danger" onDismiss={clearError} />
      {children}
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View pointerEvents="none" style={styles.backgroundLayer}>
        <View style={styles.portalBg} />
        <View style={styles.bgGlowTop} />
        <View style={styles.bgGlowBottom} />
      </View>
      <View style={[styles.shell, isWeb ? styles.shellWeb : undefined, isWide ? styles.shellWide : styles.shellStack]}>
        {isWide ? (
          <View style={[styles.sidebar, isWeb ? styles.sidebarWeb : undefined, portalGlass()]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Volver a ventas" onPress={() => router.push('/ventas')} style={styles.logoButton}>
              <BrandLogo tone="light" size="md" plain />
            </Pressable>
            <ScrollView
              {...({ className: 'portal-scrollbar' } as any)}
              style={styles.sidebarScroll}
              contentContainerStyle={styles.sidebarScrollContent}
              showsVerticalScrollIndicator={false}>
              <View style={styles.navList}>
                {navSections.map((section) => (
                  <View key={section.title} style={styles.navSection}>
                    <Text style={styles.navSectionTitle}>{section.title}</Text>
                    {section.items.filter((item) => !item.permission || hasPortalPermission(user, item.permission)).map((item) => renderNavItem(item))}
                  </View>
                ))}
              </View>
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar sesión"
              onPress={() => void signOut()}
              style={styles.logoutButton}>
              <MaterialCommunityIcons name="logout" size={20} color={portalPalette.danger} />
              <Text style={styles.logoutText}>Cerrar sesión</Text>
            </Pressable>
          </View>
        ) : null}

        {isWeb ? (
          <View {...({ className: 'portal-scrollbar' } as any)} nativeID="portal-content-scroll" style={[styles.contentScroll, compact ? styles.contentScrollDense : undefined]}>
            <View nativeID="portal-content" style={[styles.content, styles.contentWeb, wide ? styles.contentWide : undefined, compact ? styles.contentDense : undefined, !isWide ? styles.contentCompact : undefined]}>
              {contentBody}
            </View>
          </View>
        ) : (
          <KeyboardSafeScrollView
            style={styles.contentScroll}
            contentContainerStyle={[styles.content, !isWide ? styles.contentCompact : undefined]}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {contentBody}
          </KeyboardSafeScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: portalPalette.background,
    ...(Platform.OS === 'web'
      ? ({
          '--portal-scrollbar-radius': `${AppTheme.radius.pill}px`,
          '--portal-scrollbar-size': `${AppTheme.spacing.xs}px`,
          '--portal-scrollbar-thumb': portalPalette.mutedSoft,
          height: '100dvh',
          minHeight: 0,
          overflow: 'hidden',
        } as any)
      : { overflow: 'hidden' as const }),
  },
  portalBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: portalPalette.background,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
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
  shellWeb: {
    height: '100dvh' as any,
    minHeight: 0,
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
    gap: 12,
    margin: 14,
    marginRight: 0,
    minHeight: 0,
    overflow: 'hidden',
    padding: 16,
    width: 272,
    borderRadius: 16,
  },
  sidebarWeb: {
    alignSelf: 'flex-start',
    maxHeight: `calc(100dvh - ${AppTheme.spacing.xl}px)` as any,
    position: 'sticky' as any,
    top: 14,
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
    gap: 12,
    paddingBottom: 2,
  },
  navList: {
    gap: 12,
  },
  navSection: {
    gap: 4,
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
    gap: 8,
    minHeight: 40,
    minWidth: 0,
    paddingHorizontal: 12,
  },
  navItemActive: {
    backgroundColor: portalPalette.accentSoft,
    borderColor: 'rgba(255, 77, 125, 0.32)',
  },
  navItemHover: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
  },
  navItemPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
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
  logoutButton: {
    alignItems: 'center',
    backgroundColor: portalPalette.dangerSoft,
    borderColor: 'rgba(255, 90, 122, 0.32)',
    borderRadius: 10,
    borderWidth: 1,
    flexShrink: 0,
    flexDirection: 'row',
    gap: 6,
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
    minHeight: 0,
    minWidth: 0,
    ...(Platform.OS === 'web' ? ({ overflowY: 'auto' } as any) : {}),
  },
  content: {
    alignSelf: 'center',
    gap: AppTheme.spacing.lg,
    flexGrow: 1,
    maxWidth: 1240,
    padding: 24,
    paddingBottom: 24,
    width: '100%',
  },
  contentWeb: {
    flexGrow: 1,
    minHeight: 0,
  },
  contentScrollDense: {
    overflow: 'hidden',
  },
  contentWide: {
    maxWidth: 1640,
  },
  contentDense: {
    flex: 1,
    gap: 10,
    minHeight: 0,
    overflow: 'hidden',
    paddingBottom: 0,
    paddingTop: 20,
  },
  contentCompact: {
    paddingBottom: AppTheme.spacing.lg,
    paddingHorizontal: AppTheme.spacing.md,
    paddingTop: AppTheme.spacing.md,
  },
  mobileTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
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
    gap: 10,
    maxWidth: '100%',
    padding: 12,
  },
  mobileNavSection: {
    gap: 6,
    width: '100%',
  },
  mobileNavGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  mobileNavItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: portalPalette.line,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
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
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  headerText: {
    flex: 1,
    flexBasis: 260,
    minWidth: 0,
  },
  breadcrumb: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 4,
  },
  breadcrumbMuted: {
    color: portalPalette.mutedSoft,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '800',
  },
  breadcrumbCurrent: {
    color: portalPalette.accent,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
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
    marginTop: 2,
  },
  actions: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexWrap: 'wrap',
    flexShrink: 1,
    gap: 8,
    justifyContent: 'flex-end',
    maxWidth: '100%',
  },
});
