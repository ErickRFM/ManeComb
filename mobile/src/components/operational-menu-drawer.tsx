import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { router, usePathname } from '@/src/navigation/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, DesignSystem, Typography } from '@/constants/theme';
import {
  getAppSections,
  getSectionByPathname,
  type AppSection,
  type AppSectionKey,
} from '@/src/desktop/desktop-navigation';
import { BrandLogo } from '@/src/components/brand-logo';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';

type OperationalMenuDrawerProps = {
  visible: boolean;
  onClose: () => void;
  activeKey?: AppSectionKey;
  subtitle?: string;
};

const DRAWER_WIDTH = 340;

export function OperationalMenuDrawer({
  visible,
  onClose,
  activeKey,
  subtitle,
}: OperationalMenuDrawerProps) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const slideProgress = useRef(new Animated.Value(1)).current;
  const [shouldRender, setShouldRender] = useState(visible);
  const {
    conversations,
    incidents,
    mapData,
    signOut,
    user,
    users,
  } = useAppStore(
    useShallow((state) => ({
      conversations: state.conversations,
      incidents: state.incidents,
      mapData: state.mapData,
      signOut: state.signOut,
      user: state.user,
      users: state.users,
    }))
  );

  const sections = useMemo(() => (user ? getAppSections(user.role) : []), [user]);
  const activeIncidentCount = useMemo(
    () => incidents.filter((incident) => incident.status !== 'resolved').length,
    [incidents]
  );
  const derivedKey = useMemo(() => {
    if (!user) {
      return activeKey;
    }

    const currentSection = getSectionByPathname(pathname, user.role);
    return activeKey || currentSection.key;
  }, [activeKey, pathname, user]);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
    }
  }, [visible]);

  useEffect(() => {
    if (!shouldRender) {
      return;
    }

    slideProgress.stopAnimation();
    Animated.timing(slideProgress, {
      toValue: visible ? 0 : 1,
      duration: visible ? 280 : 250,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) {
        setShouldRender(false);
      }
    });
  }, [shouldRender, slideProgress, visible]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !shouldRender || typeof document === 'undefined') {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [shouldRender]);

  if (!shouldRender || !user) {
    return null;
  }

  const handleSectionPress = (href: AppSection['href']) => {
    onClose();

    if (pathname !== href) {
      router.push(href);
    }
  };

  const getBadgeLabel = (key: AppSectionKey) => {
    switch (key) {
      case 'mapa':
        return mapData ? `${mapData.vehicles.length}` : undefined;
      case 'incidencias':
        return activeIncidentCount ? `${activeIncidentCount}` : undefined;
      case 'usuarios':
        return users.length ? `${users.length}` : undefined;
      case 'chat':
        return conversations.length ? `${conversations.length}` : undefined;
      default:
        return undefined;
    }
  };

  return (
    <View style={styles.drawerLayer}>
      <Animated.View
        style={[
          styles.drawerBackdrop,
          {
            opacity: slideProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
            }),
            ...(Platform.OS === 'web' ? { willChange: 'opacity' } : {}),
          },
        ]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.line,
            paddingTop: insets.top + AppTheme.spacing.lg,
            paddingBottom: Math.max(insets.bottom, AppTheme.spacing.xl),
            transform: [
              {
                translateX: slideProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, DRAWER_WIDTH],
                }),
              },
            ],
            ...(Platform.OS === 'web'
              ? {
                  boxShadow: '-4px 0px 22px rgba(4, 16, 27, 0.16)',
                  willChange: 'transform',
                }
              : {
                  shadowColor: theme.colors.shadow,
                  shadowOpacity: 1,
                  shadowRadius: 22,
                  shadowOffset: { width: -4, height: 0 },
                  elevation: 16,
                }),
          },
        ]}>
        <View style={styles.drawerHeader}>
          <BrandLogo
            size="md"
            subtitle={subtitle}
            tone={theme.mode === 'light' ? 'dark' : 'light'}
          />
          <View
            style={[
              styles.headerBadge,
              {
                backgroundColor: theme.colors.infoSoft,
                borderColor: theme.colors.line,
              },
            ]}>
            <Text style={[styles.headerBadgeText, { color: theme.colors.info }]}>
              {sections.length} secciones
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.drawerScroll}
          contentContainerStyle={styles.drawerList}
          showsVerticalScrollIndicator={false}>
          {sections.map((section) => {
            const isActive = section.key === derivedKey;
            const badgeLabel = getBadgeLabel(section.key);
            const itemBadgeBackgroundStyle = isActive
              ? styles.itemBadgeActive
              : { backgroundColor: theme.colors.infoSoft };

            return (
              <Pressable
                key={section.key}
                onPress={() => handleSectionPress(section.href)}
                style={({ pressed }) => [
                  styles.drawerItem,
                  {
                    backgroundColor: isActive ? theme.colors.accentSoft : theme.colors.surfaceAlt,
                    borderColor: isActive ? theme.colors.accent : theme.colors.line,
                  },
                  pressed ? styles.itemPressed : undefined,
                ]}>
                <View
                  style={[
                    styles.drawerItemIcon,
                    {
                      backgroundColor: isActive ? theme.colors.accent : theme.colors.surface,
                      borderColor: isActive ? theme.colors.accent : theme.colors.line,
                    },
                  ]}>
                  <MaterialCommunityIcons
                    name={section.icon}
                    size={22}
                    color={isActive ? '#FFFFFF' : theme.colors.text}
                  />
                </View>

                <View style={styles.drawerItemCopy}>
                  <Text style={[styles.drawerItemTitle, { color: theme.colors.text }]}>{section.label}</Text>
                  <Text style={[styles.drawerItemMeta, { color: theme.colors.muted }]}>
                    {section.description}
                  </Text>
                </View>

                {badgeLabel ? (
                  <View
                    style={[
                      styles.itemBadge,
                      itemBadgeBackgroundStyle,
                    ]}>
                    <Text
                      style={[
                        styles.itemBadgeText,
                        { color: isActive ? theme.colors.accent : theme.colors.info },
                      ]}>
                      {badgeLabel}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          onPress={() => {
            onClose();
            signOut().finally(() => router.replace('/login'));
          }}
          style={({ pressed }) => [
            styles.signOutButton,
            {
              backgroundColor: theme.colors.surfaceAlt,
              borderColor: theme.colors.line,
            },
            pressed ? styles.itemPressed : undefined,
          ]}>
          <MaterialCommunityIcons name="logout" size={18} color={theme.colors.accent} />
          <Text style={[styles.signOutText, { color: theme.colors.accent }]}>Cerrar sesión</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  drawerLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    elevation: 50,
    alignItems: 'flex-end',
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 10, 16, 0.36)',
  },
  drawer: {
    width: '84%',
    maxWidth: DRAWER_WIDTH,
    height: '100%',
    borderLeftWidth: 1,
    paddingHorizontal: 14,
    gap: 10,
  },
  drawerHeader: {
    gap: 8,
  },
  headerBadge: {
    alignSelf: 'flex-start',
    borderRadius: DesignSystem.radius.chip,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  headerBadgeText: {
    fontFamily: Typography.body,
    fontSize: DesignSystem.typography.caption.size,
    fontWeight: DesignSystem.typography.caption.weight,
  },
  drawerScroll: {
    flex: 1,
  },
  drawerList: {
    gap: 7,
    paddingBottom: 12,
  },
  drawerItem: {
    borderWidth: 1,
    borderRadius: DesignSystem.radius.card,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemPressed: {
    opacity: DesignSystem.opacity.pressed,
    transform: [{ scale: 0.985 }],
  },
  drawerItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerItemCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  drawerItemTitle: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '800',
  },
  drawerItemMeta: {
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 17,
  },
  itemBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  itemBadgeActive: {
    backgroundColor: 'rgba(227, 30, 36, 0.12)',
  },
  itemBadgeText: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
  signOutButton: {
    minHeight: 48,
    borderRadius: DesignSystem.radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  signOutText: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '800',
  },
});
