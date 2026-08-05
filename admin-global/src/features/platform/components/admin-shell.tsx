import { useEffect, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, usePathname } from '@/components/router';
import { useAdminStore } from '@/features/auth/store';
import { palette, Typography } from '@/styles/theme';
import { getAdminNavigation } from '../navigation';
import { usePlatformStore } from '../store';

type AdminShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  actions?: ReactNode;
};

export function AdminShell({ title, subtitle, children, actions }: AdminShellProps) {
  const { width } = useWindowDimensions();
  const pathname = usePathname().replace(/\/+$/, '') || '/';
  const session = useAdminStore((state) => state.session);
  const logout = useAdminStore((state) => state.logout);
  const capabilities = usePlatformStore((state) => state.capabilities);
  const load = usePlatformStore((state) => state.load);
  const resetPlatform = usePlatformStore((state) => state.reset);
  const isDesktop = width >= 900;
  const navigation = getAdminNavigation(capabilities);

  useEffect(() => {
    if (session?.token) void load(session.token);
  }, [load, session?.token]);

  const handleLogout = async () => {
    resetPlatform();
    await logout();
    router.replace('/admin/login');
  };

  if (!session) return null;

  const navigationContent = navigation.map((item) => {
    const active = pathname === item.path;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        key={item.key}
        onPress={() => router.push(item.path)}
        style={({ pressed }) => [
          styles.navigationItem,
          active && styles.navigationItemActive,
          pressed && styles.navigationItemPressed,
          !isDesktop && styles.navigationItemMobile,
        ]}
      >
        <View style={styles.navigationCopy}>
          <Text style={[styles.navigationLabel, active && styles.navigationLabelActive]}>
            {isDesktop ? item.label : item.shortLabel}
          </Text>
          {isDesktop ? (
            <Text numberOfLines={2} style={styles.navigationDescription}>
              {item.description}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.phaseBadge, item.phase === 'P1' && styles.phaseBadgeReady]}>
          {item.phase}
        </Text>
      </Pressable>
    );
  });

  return (
    <View style={[styles.root, isDesktop ? styles.rootDesktop : styles.rootMobile]}>
      {isDesktop ? (
        <View style={styles.sidebar}>
          <View style={styles.brandBlock}>
            <View style={styles.brandRow}>
              <Text style={styles.brand}>ManeComb</Text>
              <Text style={styles.adminBadge}>Admin</Text>
            </View>
            <Text style={styles.brandCaption}>Centro de mando interno</Text>
          </View>

          <ScrollView contentContainerStyle={styles.sidebarNavigation}>
            {navigationContent}
          </ScrollView>

          <View style={styles.accountBlock}>
            <Text numberOfLines={1} style={styles.accountName}>{session.user.name || session.user.email}</Text>
            <Text numberOfLines={1} style={styles.accountEmail}>{session.user.email}</Text>
            <View style={styles.roleRow}>
              <Text style={styles.roleBadge}>{session.user.role.replace('platform_', '')}</Text>
              <Text style={styles.secureLabel}>MFA activo</Text>
            </View>
            <Pressable onPress={handleLogout} style={({ pressed }) => [styles.logoutButton, pressed && styles.navigationItemPressed]}>
              <Text style={styles.logoutText}>Cerrar sesión</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.mobileChrome}>
          <View style={styles.mobileHeader}>
            <View>
              <Text style={styles.brand}>ManeComb</Text>
              <Text style={styles.brandCaption}>Admin Global</Text>
            </View>
            <Pressable onPress={handleLogout} style={styles.mobileLogoutButton}>
              <Text style={styles.logoutText}>Salir</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.mobileNavigation}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {navigationContent}
          </ScrollView>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.pageContent}
        style={styles.pageScroll}
      >
        <View style={styles.pageHeader}>
          <View style={styles.pageHeading}>
            <Text style={styles.eyebrow}>ADMIN GLOBAL</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          {actions ? <View style={styles.pageActions}>{actions}</View> : null}
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: palette.background,
    flex: 1,
    minHeight: '100vh' as any,
  },
  rootDesktop: { flexDirection: 'row' },
  rootMobile: { flexDirection: 'column' },
  sidebar: {
    backgroundColor: '#090E15',
    borderRightColor: palette.line,
    borderRightWidth: 1,
    minHeight: '100vh' as any,
    paddingHorizontal: 18,
    paddingVertical: 22,
    width: 280,
  },
  brandBlock: { borderBottomColor: palette.line, borderBottomWidth: 1, paddingBottom: 20 },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  brand: { color: palette.text, fontFamily: Typography.display, fontSize: 20, fontWeight: '900' },
  adminBadge: {
    backgroundColor: palette.accentSoft,
    borderColor: 'rgba(227, 30, 36, 0.35)',
    borderRadius: 999,
    borderWidth: 1,
    color: '#FF9DA0',
    fontFamily: Typography.body,
    fontSize: 9,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    textTransform: 'uppercase',
  },
  brandCaption: { color: palette.mutedSoft, fontFamily: Typography.body, fontSize: 12, marginTop: 5 },
  sidebarNavigation: { gap: 8, paddingVertical: 18 },
  navigationItem: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  navigationItemActive: { backgroundColor: palette.accentSoft, borderColor: 'rgba(227, 30, 36, 0.3)' },
  navigationItemPressed: { opacity: 0.72 },
  navigationItemMobile: { backgroundColor: palette.card, minHeight: 42, paddingVertical: 7 },
  navigationCopy: { flex: 1 },
  navigationLabel: { color: palette.muted, fontFamily: Typography.body, fontSize: 13, fontWeight: '800' },
  navigationLabelActive: { color: palette.text },
  navigationDescription: { color: palette.mutedSoft, fontFamily: Typography.body, fontSize: 10, lineHeight: 14, marginTop: 3 },
  phaseBadge: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: 999,
    color: palette.mutedSoft,
    fontFamily: Typography.mono,
    fontSize: 9,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  phaseBadgeReady: { backgroundColor: 'rgba(53, 200, 107, 0.14)', color: palette.success },
  accountBlock: { borderTopColor: palette.line, borderTopWidth: 1, gap: 5, paddingTop: 18 },
  accountName: { color: palette.text, fontFamily: Typography.body, fontSize: 13, fontWeight: '800' },
  accountEmail: { color: palette.mutedSoft, fontFamily: Typography.body, fontSize: 11 },
  roleRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 7 },
  roleBadge: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: 999,
    color: palette.info,
    fontFamily: Typography.mono,
    fontSize: 9,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
  secureLabel: { color: palette.success, fontFamily: Typography.body, fontSize: 10, fontWeight: '700' },
  logoutButton: {
    alignItems: 'center',
    borderColor: palette.line,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 40,
  },
  logoutText: { color: palette.muted, fontFamily: Typography.body, fontSize: 12, fontWeight: '800' },
  mobileChrome: { backgroundColor: '#090E15', borderBottomColor: palette.line, borderBottomWidth: 1 },
  mobileHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16 },
  mobileLogoutButton: { borderColor: palette.line, borderRadius: 9, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  mobileNavigation: { gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  pageScroll: { flex: 1 },
  pageContent: { alignSelf: 'center', gap: 22, maxWidth: 1240, padding: 24, width: '100%' },
  pageHeader: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 18, justifyContent: 'space-between' },
  pageHeading: { flex: 1, minWidth: 260 },
  eyebrow: { color: palette.accent, fontFamily: Typography.mono, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: palette.text, fontFamily: Typography.display, fontSize: 30, fontWeight: '900', marginTop: 6 },
  subtitle: { color: palette.muted, fontFamily: Typography.body, fontSize: 14, lineHeight: 21, marginTop: 6, maxWidth: 720 },
  pageActions: { alignItems: 'center', flexDirection: 'row', gap: 10 },
});
