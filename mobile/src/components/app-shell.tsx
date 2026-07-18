import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { usePathname } from '@/src/navigation/router';
import { useMemo, useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
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
import { KeyboardSafeScrollView, KeyboardSafeView } from './keyboard-safe-layout';

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
  hideMobileToolbar?: boolean;
  /**
   * Keyboard avoidance for the non-scrolling branch. Defaults to `true` so any
   * screen that opts out of the shared scroll path (scroll={false}) still lifts
   * its inputs above the IME. Screens that provide their own KeyboardSafeView
   * (e.g. the chat composer with behavior="translate-with-padding") pass `false`
   * to avoid a double offset. Ignored when scroll is true (the scroll view
   * already handles insets).
   */
  keyboardSafe?: boolean;
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
  hideMobileToolbar = false,
  keyboardSafe = true,
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
  const topChrome = isMobileLayout && !hideMobileToolbar ? (
    <View style={styles.mobileToolbar}>
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
        <KeyboardSafeScrollView
          style={styles.scroll}
          contentContainerStyle={contentStyles}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          {...scrollProps}>
          <ConnectionBanner />
          {mobileHeaderChrome}
          {children}
        </KeyboardSafeScrollView>
      ) : keyboardSafe && Platform.OS !== 'web' ? (
        <KeyboardSafeView behavior="padding" style={contentStyles}>
          <ConnectionBanner />
          {mobileHeaderChrome}
          {children}
        </KeyboardSafeView>
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
    paddingHorizontal: AppTheme.spacing.sm,
    paddingTop: AppTheme.spacing.xs,
    paddingBottom: AppTheme.spacing.lg,
    gap: 10,
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
    fontSize: 26,
    lineHeight: 32,
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
