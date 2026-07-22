import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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

  return (
    <AppCard style={[styles.sectionCard, compact ? styles.sectionCardCompact : undefined, { borderColor: portalPalette.line }, portalGlass()]}>
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
    backgroundImage: 'linear-gradient(180deg, rgba(19,29,47,.98) 0%, rgba(10,18,32,.98) 100%)' as any,
    boxShadow: 'inset 3px 0 0 rgba(240,68,95,.72), inset 0 1px 0 rgba(255,255,255,.045), 0 18px 42px rgba(0,0,0,.3)' as any,
    gap: 10,
    padding: 12,
  },
  sectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'space-between',
  },
  sectionTitleWrap: {
    flex: 1,
    flexBasis: 220,
    minWidth: 0,
  },
  sectionRight: {
    alignItems: 'flex-start',
    flexShrink: 0,
    maxWidth: '100%',
  },
  sectionTitle: {
    fontFamily: Typography.display,
    fontSize: 17,
    fontWeight: '900',
  },
  sectionSubtitle: {
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 1,
  },
});
