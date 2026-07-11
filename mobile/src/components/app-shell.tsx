import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router, usePathname } from '@/src/navigation/router';
import { useMemo, useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, DesignSystem, Typography } from '@/constants/theme';
import type { AppSectionKey } from '@/src/desktop/desktop-navigation';
import { getSectionByPathname } from '@/src/desktop/desktop-navigation';
import { useDesktopMode } from '@/src/desktop/use-desktop-mode';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import { ConnectionBanner } from './connection-banner';
import { OperationalMenuDrawer } from './operational-menu-drawer';

type MobileBadgeTone = 'info' | 'positive' | 'warning' | 'danger' | 'neutral';

type AppShellProps = PropsWithChildren<{
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  header?: ReactNode;
  sectionKey?: AppSectionKey;
  mobileTitle?: string;
  mobileSubtitle?: string;
  mobileBadges?: {
    label: string;
    tone: MobileBadgeTone;
  }[];
  scrollProps?: Partial<import('react-native').ScrollViewProps> & { ref?: any };
}>;

export function AppShell({
  children,
  scroll = true,
  onRefresh,
  refreshing,
  contentContainerStyle,
  header,
  sectionKey,
  mobileTitle,
  mobileSubtitle,
  mobileBadges,
  scrollProps = {},
}: AppShellProps) {
  const pathname = usePathname();
  const isDesktopMode = useDesktopMode();
  const isMobileLayout = !isDesktopMode;
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme } = useAppTheme();
  const { user } = useAppStore(
    useShallow((state) => ({
      user: state.user,
    }))
  );

  const activeSection = useMemo(() => {
    if (!user) {
      return null;
    }

    const sections = [getSectionByPathname(pathname, user.role)];
    const currentSection =
      sectionKey && sectionKey !== sections[0].key
        ? getSectionByPathname(`/${sectionKey}`, user.role)
        : sections[0];

    return currentSection;
  }, [pathname, sectionKey, user]);

  const refreshControl =
    onRefresh && typeof refreshing === 'boolean' ? (
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
    ) : undefined;
  const defaultMobileHeader =
    isMobileLayout && mobileTitle ? (
      <View style={styles.defaultMobileHeader}>
        <Text style={[styles.defaultMobileTitle, { color: theme.colors.text }]}>{mobileTitle}</Text>
        {mobileSubtitle ? (
          <Text style={[styles.defaultMobileSubtitle, { color: theme.colors.muted }]}>
            {mobileSubtitle}
          </Text>
        ) : null}
        {mobileBadges?.length ? (
          <View style={styles.defaultMobileBadges}>
            {mobileBadges.map((badge) => (
              <View
                key={`${badge.label}-${badge.tone}`}
                style={[
                  styles.defaultMobileBadge,
                  {
                    backgroundColor:
                      badge.tone === 'danger'
                        ? theme.colors.dangerSoft
                        : badge.tone === 'warning'
                          ? theme.colors.warningSoft
                          : badge.tone === 'positive'
                            ? theme.colors.successSoft
                            : badge.tone === 'neutral'
                              ? theme.colors.surfaceAlt
                              : theme.colors.infoSoft,
                  },
                ]}>
                <Text
                  style={[
                    styles.defaultMobileBadgeText,
                    {
                      color:
                        badge.tone === 'danger'
                          ? theme.colors.danger
                          : badge.tone === 'warning'
                            ? theme.colors.warning
                            : badge.tone === 'positive'
                              ? theme.colors.success
                              : badge.tone === 'neutral'
                                ? theme.colors.muted
                                : theme.colors.info,
                    },
                  ]}>
                  {badge.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    ) : null;
  const resolvedHeader = isDesktopMode ? null : header || defaultMobileHeader;

  const contentStyles = [
    styles.content,
    isMobileLayout ? styles.contentMobile : undefined,
    Platform.OS === 'web' ? (isDesktopMode ? styles.contentDesktop : styles.contentWeb) : undefined,
    contentContainerStyle,
  ];
  const topChrome = isMobileLayout ? (
    <View style={styles.mobileToolbar}>
      <Pressable
        onPress={() => router.push('/incidencias')}
        style={({ pressed }) => [
          styles.iconButton,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderColor: theme.colors.line,
          },
          pressed ? styles.iconButtonPressed : undefined,
        ]}>
        <MaterialCommunityIcons name="alert-outline" size={22} color={theme.colors.accent} />
      </Pressable>
      <Pressable
        onPress={() => setMenuOpen((current) => !current)}
        style={({ pressed }) => [
          styles.iconButton,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderColor: theme.colors.line,
          },
          pressed ? styles.iconButtonPressed : undefined,
        ]}>
        <MaterialCommunityIcons name="menu" size={22} color={theme.colors.text} />
      </Pressable>
    </View>
  ) : null;
  const mobileHeaderChrome =
    isMobileLayout && resolvedHeader ? (
      <View style={styles.mobileHeaderRow}>
        <View style={styles.mobileHeaderContent}>{resolvedHeader}</View>
        {topChrome}
      </View>
    ) : (
      topChrome
    );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={contentStyles}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          {...scrollProps}>
          <ConnectionBanner />
          {mobileHeaderChrome}
          {children}
        </ScrollView>
      ) : (
        <View style={contentStyles}>
          <ConnectionBanner />
          {mobileHeaderChrome}
          {children}
        </View>
      )}

      {isMobileLayout ? (
        <OperationalMenuDrawer
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          activeKey={sectionKey || activeSection?.key}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    minWidth: 0,
    paddingHorizontal: AppTheme.spacing.lg,
    paddingTop: AppTheme.spacing.sm,
    paddingBottom: AppTheme.spacing.xxl,
    gap: AppTheme.spacing.lg,
  },
  contentMobile: {
    paddingHorizontal: AppTheme.spacing.md,
    paddingTop: AppTheme.spacing.sm,
    paddingBottom: AppTheme.spacing.xl,
    gap: 12,
  },
  contentWeb: {
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
  },
  contentDesktop: {
    width: '100%',
    maxWidth: 1460,
    alignSelf: 'center',
    paddingHorizontal: AppTheme.spacing.lg,
    paddingTop: AppTheme.spacing.md,
    paddingBottom: AppTheme.spacing.xxl,
  },
  mobileToolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexShrink: 0,
    gap: 8,
    marginTop: 6,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonPressed: {
    opacity: DesignSystem.opacity.pressed,
    transform: [{ scale: 0.96 }],
  },
  mobileHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    minWidth: 0,
  },
  mobileHeaderContent: {
    flex: 1,
    minWidth: 0,
  },
  defaultMobileHeader: {
    gap: 8,
    paddingTop: 6,
  },
  defaultMobileTitle: {
    fontFamily: Typography.display,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    minWidth: 0,
  },
  defaultMobileSubtitle: {
    fontFamily: Typography.body,
    fontSize: 14,
    lineHeight: 21,
  },
  defaultMobileBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  defaultMobileBadge: {
    borderRadius: AppTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  defaultMobileBadgeText: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
});
