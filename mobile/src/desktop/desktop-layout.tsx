import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router, usePathname } from '@/src/navigation/router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { BrandLogo } from '@/src/components/brand-logo';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import { getAppSections } from './desktop-navigation';

const DESKTOP_SIDEBAR_WIDTH = 304;

function normalizePath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
}

function isSectionActive(pathname: string, href: string) {
  const normalizedPathname = normalizePath(pathname);
  const normalizedHref = href === '/(tabs)' ? '/dashboard' : normalizePath(href);

  if (normalizedHref === '/dashboard') {
    return normalizedPathname === '/dashboard' || normalizedPathname === '/(tabs)' || normalizedPathname === '/index';
  }

  return normalizedPathname === normalizedHref || normalizedPathname.startsWith(`${normalizedHref}/`);
}

export function DesktopLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useAppTheme();
  const pathname = usePathname();
  const { user, incidents } = useAppStore(
    useShallow((state) => ({
      user: state.user,
      incidents: state.incidents,
    }))
  );

  const sections = useMemo(() => (user ? getAppSections(user.role) : []), [user]);
  const criticalIncident = useMemo(
    () => incidents.find((incident) => incident.severity === 'critical' && incident.status === 'open'),
    [incidents]
  );
  const openIncidents = useMemo(
    () => incidents.filter((incident) => incident.status === 'open').length,
    [incidents]
  );

  if (!user) return <View style={styles.emptyContent}>{children}</View>;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <View
        style={[
          styles.sidebar,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.line,
          },
        ]}>
        <View style={styles.brand}>
          <BrandLogo size="md" />
          <View style={styles.insightRow}>
            <View
              style={[
                styles.insightCard,
                {
                  backgroundColor: theme.colors.surfaceAlt,
                  borderColor: theme.colors.line,
                },
              ]}>
              <Text style={[styles.insightLabel, { color: theme.colors.muted }]}>Incidencias</Text>
              <Text style={[styles.insightValue, { color: theme.colors.text }]}>{openIncidents}</Text>
            </View>
            <View
              style={[
                styles.insightCard,
                {
                  backgroundColor: theme.colors.surfaceAlt,
                  borderColor: theme.colors.line,
                },
              ]}>
              <Text style={[styles.insightLabel, { color: theme.colors.muted }]}>Rol</Text>
              <Text style={[styles.insightValue, { color: theme.colors.text }]}>{user.role}</Text>
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.navScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.navGroup}>
            <Text style={[styles.navLabel, { color: theme.colors.muted }]}>NAVEGACION</Text>
            {sections.map((section) => {
              const isActive = isSectionActive(pathname, section.href);

              return (
                <Pressable
                  key={section.key}
                  onPress={() => router.push(section.href as any)}
                  style={[
                    styles.navItem,
                    isActive && { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent },
                  ]}>
                  <MaterialCommunityIcons
                    name={section.icon}
                    size={20}
                    color={isActive ? theme.colors.accent : theme.colors.text}
                  />
                  <View style={styles.navCopy}>
                    <Text style={[styles.navText, { color: isActive ? theme.colors.accent : theme.colors.text }]}>
                      {section.label}
                    </Text>
                    <Text
                      style={[
                        styles.navDescription,
                        { color: isActive ? theme.colors.text : theme.colors.muted },
                      ]}
                      numberOfLines={1}>
                      {section.eyebrow}
                    </Text>
                  </View>
                  {isActive ? <View style={[styles.activeIndicator, { backgroundColor: theme.colors.accent }]} /> : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>

      <View style={styles.content}>
        <View
          style={[
            styles.contentGlow,
            {
              backgroundColor: theme.colors.pageGlow,
            },
          ]}
        />
        {criticalIncident ? (
          <Pressable
            onPress={() => router.push('/incidencias')}
            style={[styles.sosBanner, { backgroundColor: theme.colors.danger }]}>
            <MaterialCommunityIcons name="alert-octagon" size={20} color="#FFF" />
            <Text style={styles.sosBannerText}>
              ALERTA CRITICA: {criticalIncident.title} - {criticalIncident.vehicle?.code || 'Unidad desconocida'}
            </Text>
            <Text style={styles.sosBannerAction}>ATENDER AHORA</Text>
          </Pressable>
        ) : null}
        <View
          style={[
            styles.viewWrapper,
            {
              backgroundColor: theme.colors.background,
              borderColor: theme.colors.line,
              ...(theme.mode === 'light'
                ? { boxShadow: `0px 20px 45px ${theme.colors.shadow}` }
                : {}),
            },
          ]}>
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row-reverse' },
  emptyContent: {
    flex: 1,
  },
  sidebar: {
    width: DESKTOP_SIDEBAR_WIDTH,
    flexBasis: DESKTOP_SIDEBAR_WIDTH,
    flexShrink: 0,
    borderLeftWidth: 1,
    paddingVertical: 22,
    zIndex: 2,
  },
  brand: { gap: 14, paddingHorizontal: 18, marginBottom: 18 },
  insightRow: {
    flexDirection: 'row',
    gap: 10,
  },
  insightCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  insightLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  insightValue: {
    fontSize: 15,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  navScroll: { paddingHorizontal: 12, paddingBottom: 20 },
  navGroup: { gap: 4 },
  navLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginLeft: 14, marginBottom: 8 },
  navItem: {
    minHeight: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 13,
    gap: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingVertical: 10,
  },
  navCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  navText: { fontSize: 14, fontWeight: '700' },
  navDescription: { fontSize: 11, fontWeight: '600' },
  activeIndicator: { width: 4, height: 20, borderRadius: 2, position: 'absolute', right: 12 },
  content: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    gap: 10,
    position: 'relative',
  },
  contentGlow: {
    position: 'absolute',
    top: 32,
    right: 36,
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  viewWrapper: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
  },
  sosBanner: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 12,
    elevation: 10,
    borderRadius: 16,
  },
  sosBannerText: { color: '#FFF', fontWeight: '800', fontSize: 13, flex: 1 },
  sosBannerAction: { color: '#FFF', fontWeight: '900', fontSize: 11, textDecorationLine: 'underline' },
});
