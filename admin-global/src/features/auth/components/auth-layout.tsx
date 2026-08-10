import { type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Typography, palette } from '@/styles/theme';
import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll';

type Props = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function AdminAuthLayout({ title, subtitle, children }: Props) {
  return (
    <View style={styles.safeArea}>
      <View pointerEvents="none" style={styles.backgroundLayer}>
        <View style={styles.backgroundBase} />
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />
      </View>
      <KeyboardSafeScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.panel}>
          <View style={styles.brandRow}>
            <Text style={styles.brandText}>ManeComb</Text>
            <Text style={styles.brandBadge}>Admin</Text>
          </View>
          <View style={styles.headingBlock}>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          {children}
        </View>
      </KeyboardSafeScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050816',
    ...(Platform.OS === 'web'
      ? ({ minHeight: '100dvh', overflow: 'visible' } as any)
      : { overflow: 'hidden' as const }),
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  backgroundBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050816',
  },
  glowTop: {
    position: 'absolute',
    top: -150,
    right: -110,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(227, 30, 36, 0.2)',
  },
  glowBottom: {
    position: 'absolute',
    left: -140,
    bottom: -150,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: 'rgba(255, 36, 92, 0.18)',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  panel: {
    width: '100%',
    maxWidth: 410,
    gap: 24,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  brandText: {
    color: '#F8FAFC',
    fontFamily: Typography.display,
    fontSize: 22,
    fontWeight: '900',
  },
  brandBadge: {
    color: '#FF8FB0',
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    backgroundColor: 'rgba(255, 36, 92, 0.1)',
    borderColor: 'rgba(255, 77, 125, 0.32)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  headingBlock: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: '#F8FAFC',
    fontFamily: Typography.display,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 32,
    textAlign: 'center',
  },
  subtitle: {
    color: palette.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
