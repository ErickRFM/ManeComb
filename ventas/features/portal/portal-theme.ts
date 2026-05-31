import { Platform } from 'react-native';

export const portalPalette = {
  background: '#070A12',
  backgroundAlt: '#0B101B',
  surface: 'rgba(14, 19, 31, 0.9)',
  surfaceStrong: 'rgba(18, 24, 38, 0.96)',
  surfaceSoft: 'rgba(255, 255, 255, 0.055)',
  line: 'rgba(255, 255, 255, 0.085)',
  lineStrong: 'rgba(255, 255, 255, 0.18)',
  text: '#F8FAFC',
  muted: 'rgba(218, 226, 240, 0.7)',
  mutedSoft: 'rgba(148, 163, 184, 0.72)',
  accent: '#F0445F',
  accentAlt: '#8B5CF6',
  accentSoft: 'rgba(240, 68, 95, 0.13)',
  accentStrong: '#EA1F23',
  success: '#52F2A7',
  successSoft: 'rgba(82, 242, 167, 0.12)',
  warning: '#FFD166',
  warningSoft: 'rgba(255, 209, 102, 0.12)',
  danger: '#FF5A7A',
  dangerSoft: 'rgba(255, 90, 122, 0.12)',
  info: '#23D5FF',
  infoSoft: 'rgba(35, 213, 255, 0.12)',
  violet: '#8B5CF6',
  violetSoft: 'rgba(139, 92, 246, 0.12)',
};

export function portalGlass(overrides?: Record<string, unknown>) {
  if (Platform.OS === 'web') {
    return {
      backgroundImage:
        'linear-gradient(145deg, rgba(14, 19, 31, 0.94), rgba(16, 22, 36, 0.9))',
      backdropFilter: 'blur(16px)',
      boxShadow:
        '0 0 0 1px rgba(255,255,255,0.035), 0 18px 44px rgba(0,0,0,0.32)',
      ...overrides,
    } as any;
  }

  return {
    backgroundColor: portalPalette.surface,
    shadowColor: '#000000',
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
    backgroundColor: portalPalette.accent,
    shadowColor: portalPalette.accent,
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  };
}
