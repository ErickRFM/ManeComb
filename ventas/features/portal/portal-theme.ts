import { Platform } from 'react-native';
import { getAppPalette } from '@/constants/theme';

const darkPalette = getAppPalette('dark');

export const portalPalette = {
  background: darkPalette.background,
  backgroundAlt: darkPalette.surface,
  surface: 'rgba(18, 24, 33, 0.92)',
  surfaceStrong: 'rgba(20, 26, 34, 0.96)',
  surfaceSoft: 'rgba(255, 255, 255, 0.055)',
  line: darkPalette.line,
  lineStrong: darkPalette.lineStrong,
  text: darkPalette.text,
  muted: darkPalette.muted,
  mutedSoft: darkPalette.mutedSoft,
  accent: darkPalette.accent,
  accentAlt: darkPalette.info,
  accentSoft: darkPalette.accentSoft,
  accentStrong: darkPalette.accentStrong,
  success: darkPalette.success,
  successSoft: darkPalette.successSoft,
  warning: darkPalette.warning,
  warningSoft: darkPalette.warningSoft,
  danger: darkPalette.danger,
  dangerSoft: darkPalette.dangerSoft,
  info: darkPalette.info,
  infoSoft: darkPalette.infoSoft,
  violet: darkPalette.info,
  violetSoft: 'rgba(139, 92, 246, 0.12)',
};

export function portalGlass(overrides?: Record<string, unknown>) {
  if (Platform.OS === 'web') {
    return {
      backgroundImage:
        'linear-gradient(145deg, rgba(18, 24, 33, 0.94), rgba(20, 26, 34, 0.9))',
      backdropFilter: 'blur(16px)',
      boxShadow:
        '0 0 0 1px rgba(255,255,255,0.035), 0 18px 44px rgba(0,0,0,0.32)',
      ...overrides,
    } as any;
  }

  return {
    backgroundColor: portalPalette.surface,
    shadowColor: darkPalette.shadow,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
    ...overrides,
  };
}

export function portalButtonGradient() {
  if (Platform.OS === 'web') {
    return {
      backgroundImage: 'linear-gradient(135deg, #E31E24, #F0445F 66%, #8B5CF6)',
      boxShadow: '0 10px 22px rgba(240, 68, 95, 0.2)',
    } as any;
  }

  return {
    backgroundColor: darkPalette.accent,
    shadowColor: portalPalette.accent,
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  };
}
