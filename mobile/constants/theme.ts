import type { Theme } from '@react-navigation/native';
import { Platform } from 'react-native';

export type ThemeMode = 'light' | 'dark';

const baseSpacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  xxl: 40,
} as const;

const baseRadius = {
  xs: 10,
  sm: 16,
  md: 20,
  lg: 28,
  xl: 34,
  pill: 999,
} as const;

export type DesignTone = 'positive' | 'warning' | 'danger' | 'info' | 'neutral';

export const DesignSystem = {
  spacing: baseSpacing,
  radius: {
    control: baseRadius.sm,
    card: baseRadius.md,
    sheet: baseRadius.lg,
    input: baseRadius.sm,
    chip: baseRadius.pill,
    icon: baseRadius.xs,
  },
  typography: {
    hero: { size: 30, lineHeight: 36, weight: '900' as const },
    title: { size: 22, lineHeight: 28, weight: '900' as const },
    subtitle: { size: 16, lineHeight: 22, weight: '800' as const },
    body: { size: 14, lineHeight: 20, weight: '600' as const },
    caption: { size: 12, lineHeight: 16, weight: '700' as const },
    overline: { size: 11, lineHeight: 14, weight: '800' as const },
  },
  icon: {
    xs: 14,
    sm: 18,
    md: 22,
    lg: 28,
    xl: 34,
  },
  control: {
    sm: 40,
    md: 46,
    lg: 52,
    touch: 44,
  },
  motion: {
    fast: 140,
    normal: 220,
    slow: 320,
    easing: 'ease-out',
  },
  opacity: {
    disabled: 0.55,
    pressed: 0.9,
    skeleton: 0.75,
  },
} as const;

export const Typography = {
  display:
    Platform.select({
      ios: 'System',
      android: 'sans-serif-medium',
      default: 'system-ui',
    }) ?? 'System',
  body:
    Platform.select({
      ios: 'System',
      android: 'sans-serif',
      default: 'system-ui',
    }) ?? 'System',
  mono:
    Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }) ?? 'monospace',
};

export const AppTheme = {
  colors: {
    background: '#090B10',
    surface: '#11141B',
    surfaceAlt: '#181D28',
    card: '#10141C',
    cardSoft: '#161D28',
    line: 'rgba(255, 255, 255, 0.08)',
    text: '#F5F7FB',
    muted: '#A8AFBD',
    accent: '#D91E18',
    accentSoft: 'rgba(217, 30, 24, 0.16)',
    accentStrong: '#B41414',
    success: '#2DA85D',
    successSoft: 'rgba(45, 168, 93, 0.14)',
    warning: '#E6A11F',
    warningSoft: 'rgba(230, 161, 31, 0.14)',
    danger: '#E24747',
    dangerSoft: 'rgba(226, 71, 71, 0.14)',
    info: '#377DFF',
    infoSoft: 'rgba(55, 125, 255, 0.14)',
    overlay: 'rgba(9, 11, 16, 0.82)',
    shadow: 'rgba(0, 0, 0, 0.28)',
    input: '#12161E',
  },
  radius: baseRadius,
  spacing: baseSpacing,
  shadow: {
    glow: {
      shadowColor: '#04101B',
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
  },
} as const;

const themePalette = {
  light: {
    background: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceAlt: '#F6F7FB',
    card: '#FFFFFF',
    cardSoft: '#F6F7FB',
    line: '#E8EBF0',
    text: '#171A20',
    muted: '#71788A',
    accent: '#E31E24',
    accentSoft: 'rgba(227, 30, 36, 0.08)',
    accentStrong: '#C4171C',
    success: '#1C9B53',
    successSoft: 'rgba(28, 155, 83, 0.1)',
    warning: '#C98A14',
    warningSoft: 'rgba(201, 138, 20, 0.12)',
    danger: '#D83B3B',
    dangerSoft: 'rgba(216, 59, 59, 0.1)',
    info: '#2F6FF3',
    infoSoft: 'rgba(47, 111, 243, 0.1)',
    overlay: 'rgba(15, 18, 24, 0.08)',
    shadow: 'rgba(17, 24, 39, 0.08)',
    input: '#FFFFFF',
    headerGlass: 'rgba(255, 255, 255, 0.92)',
    tabBar: '#FFFFFF',
    tabBarBorder: '#E8EBF0',
    pageGlow: 'rgba(227, 30, 36, 0.04)',
    mapBackground: '#FFFFFF',
    panel: '#FFFFFF',
    panelSoft: '#F6F7FB',
    lineStrong: '#D1D5DB',
    mutedSoft: '#9CA3AF',
    statusBar: 'dark' as const,
  },
  dark: {
    background: '#0D1117',
    surface: '#141A22',
    surfaceAlt: '#1B2430',
    card: '#121821',
    cardSoft: '#19212D',
    line: 'rgba(255, 255, 255, 0.08)',
    text: '#F4F7FB',
    muted: '#A8B1C2',
    accent: '#E31E24',
    accentSoft: 'rgba(227, 30, 36, 0.16)',
    accentStrong: '#C4171C',
    success: '#35C86B',
    successSoft: 'rgba(53, 200, 107, 0.15)',
    warning: '#F0A725',
    warningSoft: 'rgba(240, 167, 37, 0.16)',
    danger: '#F06A6A',
    dangerSoft: 'rgba(240, 106, 106, 0.16)',
    info: '#6A95FF',
    infoSoft: 'rgba(106, 149, 255, 0.16)',
    overlay: 'rgba(7, 10, 16, 0.82)',
    shadow: 'rgba(0, 0, 0, 0.34)',
    input: '#10161F',
    headerGlass: 'rgba(20, 26, 34, 0.88)',
    tabBar: 'rgba(18, 24, 33, 0.97)',
    tabBarBorder: 'rgba(255, 255, 255, 0.08)',
    pageGlow: 'rgba(227, 30, 36, 0.08)',
    mapBackground: '#111722',
    panel: '#1B2430',
    panelSoft: '#242F3E',
    lineStrong: '#374151',
    mutedSoft: '#6B7280',
    statusBar: 'light' as const,
  },
} as const;

export function getAppPalette(mode: ThemeMode) {
  return themePalette[mode];
}

export function getAppTheme(mode: ThemeMode) {
  const colors = getAppPalette(mode);

  return {
    mode,
    colors,
    spacing: baseSpacing,
    radius: baseRadius,
    shadow: {
      card: {
        shadowColor: colors.shadow,
        shadowOpacity: mode === 'light' ? 1 : 0.9,
        shadowRadius: mode === 'light' ? 18 : 20,
        shadowOffset: { width: 0, height: 10 },
        elevation: mode === 'light' ? 7 : 8,
      },
      glow: {
        shadowColor: colors.accent,
        shadowOpacity: mode === 'light' ? 0.12 : 0.18,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 8 },
        elevation: 6,
      },
    },
    statusBar: colors.statusBar,
  } as const;
}

export function getToneColors(theme: ReturnType<typeof getAppTheme>, tone: DesignTone) {
  const tones = {
    positive: {
      background: theme.colors.successSoft,
      foreground: theme.colors.success,
      border: theme.colors.success,
    },
    warning: {
      background: theme.colors.warningSoft,
      foreground: theme.colors.warning,
      border: theme.colors.warning,
    },
    danger: {
      background: theme.colors.dangerSoft,
      foreground: theme.colors.danger,
      border: theme.colors.danger,
    },
    info: {
      background: theme.colors.infoSoft,
      foreground: theme.colors.info,
      border: theme.colors.info,
    },
    neutral: {
      background: theme.colors.surfaceAlt,
      foreground: theme.colors.muted,
      border: theme.colors.line,
    },
  } as const;

  return tones[tone];
}

export function getSkeletonColor(theme: ReturnType<typeof getAppTheme>) {
  return theme.mode === 'light' ? theme.colors.surfaceAlt : theme.colors.panelSoft;
}

export function getNavigationTheme(mode: ThemeMode): Theme {
  const theme = getAppTheme(mode);

  return {
    dark: mode === 'dark',
    colors: {
      primary: theme.colors.accent,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.line,
      notification: theme.colors.danger,
    },
    fonts: {
      regular: {
        fontFamily: Typography.body,
        fontWeight: '400',
      },
      medium: {
        fontFamily: Typography.body,
        fontWeight: '500',
      },
      bold: {
        fontFamily: Typography.body,
        fontWeight: '700',
      },
      heavy: {
        fontFamily: Typography.body,
        fontWeight: '700',
      },
    },
  };
}

export const Colors = {
  light: {
    text: themePalette.light.text,
    background: themePalette.light.background,
    tint: themePalette.light.accent,
    icon: themePalette.light.muted,
    tabIconDefault: themePalette.light.muted,
    tabIconSelected: themePalette.light.accent,
  },
  dark: {
    text: themePalette.dark.text,
    background: themePalette.dark.background,
    tint: themePalette.dark.accent,
    icon: themePalette.dark.muted,
    tabIconDefault: themePalette.dark.muted,
    tabIconSelected: themePalette.dark.accent,
  },
} as const;

export const NavigationTheme = getNavigationTheme('dark');
