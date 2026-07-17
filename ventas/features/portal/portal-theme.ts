import { Platform } from 'react-native';
import { palette } from '@/constants/theme';

/**
 * Cromo del portal: los mismos colores de `palette` mas las superficies
 * translucidas que solo usa el shell del portal.
 */
export const portalPalette = {
  background: palette.background,
  surface: 'rgba(18, 24, 33, 0.92)',
  surfaceStrong: 'rgba(20, 26, 34, 0.96)',
  surfaceSoft: 'rgba(255, 255, 255, 0.055)',
  line: palette.line,
  lineStrong: palette.lineStrong,
  text: palette.text,
  muted: palette.muted,
  mutedSoft: palette.mutedSoft,
  accent: palette.accent,
  accentSoft: palette.accentSoft,
  success: palette.success,
  successSoft: palette.successSoft,
  warning: palette.warning,
  warningSoft: palette.warningSoft,
  danger: palette.danger,
  dangerSoft: palette.dangerSoft,
  info: palette.info,
  infoSoft: palette.infoSoft,
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
    shadowColor: palette.shadow,
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
    backgroundColor: palette.accent,
    shadowColor: portalPalette.accent,
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  };
}
