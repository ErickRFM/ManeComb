import { Platform, type ViewStyle } from 'react-native';
import { colors } from './colors';

type ShadowLevel = 'soft' | 'card' | 'floating';

const webShadows: Record<ShadowLevel, string> = {
  soft: `0px 8px 18px ${colors.shadow}`,
  card: `0px 16px 32px ${colors.shadow}`,
  floating: `0px 24px 48px ${colors.shadow}`,
};

const nativeShadows: Record<ShadowLevel, ViewStyle> = {
  soft: {
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  card: {
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  floating: {
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
};

export function shadow(level: ShadowLevel = 'card'): ViewStyle {
  if (Platform.OS === 'android') {
    return { elevation: nativeShadows[level].elevation };
  }

  if (Platform.OS === 'web') {
    return { boxShadow: webShadows[level] } as ViewStyle;
  }

  return nativeShadows[level];
}
