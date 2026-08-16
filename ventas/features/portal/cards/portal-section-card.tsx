import type { PropsWithChildren, ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { AppCard } from '@/src/components/app-card';
import { portalGlass, portalPalette } from '../portal-theme';

export function PortalSectionCard({
  children,
  title,
  subtitle,
  right,
  compact = false,
}: PropsWithChildren<{ title: string; subtitle?: string; right?: ReactNode; compact?: boolean }>) {
  const theme = { colors: portalPalette };
  const glass = Platform.OS === 'web'
    ? portalGlass({ boxShadow: '0 10px 30px rgba(0,0,0,.22)' })
    : portalGlass({ shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 3 });

  return (
    <AppCard style={[styles.sectionCard, compact ? styles.sectionCardCompact : undefined, { borderColor: portalPalette.line }, glass]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleWrap}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.sectionSubtitle, { color: theme.colors.muted }]}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.sectionRight}>{right}</View> : null}
      </View>
      {children}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    borderRadius: AppTheme.radius.sm,
    gap: 12,
    minWidth: 0,
  },
  sectionCardCompact: {
    backgroundColor: portalPalette.surfaceStrong,
    borderLeftColor: 'rgba(240, 68, 95, 0.55)',
    borderLeftWidth: 2,
    gap: 10,
    padding: 12,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  sectionTitleWrap: {
    flex: 1,
    flexBasis: 220,
    gap: 2,
    minWidth: 0,
  },
  sectionRight: {
    alignItems: 'center',
    flexShrink: 0,
    maxWidth: '100%',
  },
  sectionTitle: {
    fontFamily: Typography.display,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 21,
  },
  sectionSubtitle: {
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
});
