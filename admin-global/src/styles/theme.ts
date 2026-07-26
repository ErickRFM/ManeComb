import { Platform } from 'react-native';

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
  warning: '#F0A725',
  danger: '#F06A6A',
  info: '#6A95FF',
};
