import { Platform } from 'react-native';

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

/** Spacing y radios compartidos. Los colores viven en `palette`. */
export const AppTheme = {
  radius: baseRadius,
  spacing: baseSpacing,
} as const;

export const palette = {
  background: '#0D1117',
  surface: '#141A22',
  surfaceAlt: '#1B2430',
  card: '#121821',
  cardSoft: '#19212D',
  line: 'rgba(255, 255, 255, 0.08)',
  lineStrong: '#374151',
  text: '#F4F7FB',
  muted: '#A8B1C2',
  mutedSoft: '#6B7280',
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
  pageGlow: 'rgba(227, 30, 36, 0.08)',
  mapBackground: '#111722',
  panel: '#1B2430',
  panelSoft: '#242F3E',
  skeleton: '#242F3E',
} as const;

export const elevation = {
  card: {
    shadowColor: palette.shadow,
    shadowOpacity: 0.9,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  glow: {
    shadowColor: palette.accent,
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

const toneColors = {
  positive: {
    background: palette.successSoft,
    foreground: palette.success,
    border: palette.success,
  },
  warning: {
    background: palette.warningSoft,
    foreground: palette.warning,
    border: palette.warning,
  },
  danger: {
    background: palette.dangerSoft,
    foreground: palette.danger,
    border: palette.danger,
  },
  info: {
    background: palette.infoSoft,
    foreground: palette.info,
    border: palette.info,
  },
  neutral: {
    background: palette.surfaceAlt,
    foreground: palette.muted,
    border: palette.line,
  },
} as const;

export function getToneColors(tone: DesignTone) {
  return toneColors[tone];
}
