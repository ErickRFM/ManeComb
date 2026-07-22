import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { AppCard } from '@/src/components/app-card';
import { StatusBadge, type StatusBadgeTone } from '@/src/components/ui/status-badge';
import { portalPalette } from '../portal-theme';

type Props = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  detail?: string;
  tone?: StatusBadgeTone;
};

export function AccountSummaryCard({ icon, label, value, detail, tone = 'info' }: Props) {
  const theme = { colors: portalPalette };

  return (
    <AppCard interactive style={[styles.summaryCard, { backgroundColor: portalPalette.surfaceStrong, borderColor: portalPalette.line }]}>
      <View style={styles.summaryTop}>
        <View style={[styles.summaryIcon, { backgroundColor: portalPalette.surfaceSoft }]}>
          <MaterialCommunityIcons name={icon} size={20} color={portalPalette.accent} />
        </View>
        <StatusBadge label={label} tone={tone} />
      </View>
      <Text style={[styles.summaryValue, { color: theme.colors.text }]} numberOfLines={2}>
        {value}
      </Text>
      {detail ? <Text style={[styles.summaryDetail, { color: theme.colors.muted }]}>{detail}</Text> : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    borderRadius: AppTheme.radius.sm,
    flex: 1,
    flexBasis: 150,
    minHeight: 70,
    minWidth: 0,
    padding: 12,
  },
  summaryTop: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  summaryIcon: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    flexShrink: 0,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  summaryValue: {
    fontFamily: Typography.display,
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 22,
    minWidth: 0,
  },
  summaryDetail: {
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 17,
    minWidth: 0,
  },
});
