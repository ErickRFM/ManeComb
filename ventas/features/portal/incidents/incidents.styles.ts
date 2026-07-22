import { StyleSheet } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { portalPalette } from '../portal-theme';

export const styles = StyleSheet.create({
  contextNotice: {
    alignItems: 'flex-start', borderRadius: AppTheme.radius.sm, borderWidth: 1,
    flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: AppTheme.spacing.md,
  },
  contextIcon: {
    alignItems: 'center', borderRadius: AppTheme.radius.xs, flexShrink: 0,
    height: 38, justifyContent: 'center', width: 38,
  },
  contextCopy: { flex: 1, flexBasis: 260, minWidth: 0 },
  contextTitle: { fontFamily: Typography.body, fontSize: 14, fontWeight: '900' },
  contextText: { fontFamily: Typography.body, fontSize: 12, lineHeight: 18 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  filterChip: {
    borderRadius: AppTheme.radius.sm, borderWidth: 1, borderColor: portalPalette.lineStrong,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  filterChipActive: { backgroundColor: portalPalette.accent, borderColor: portalPalette.accent },
  filterChipText: { color: portalPalette.text, fontFamily: Typography.body, fontSize: 12, fontWeight: '900' },
  filterChipTextActive: { color: '#FFFFFF' },
  list: { gap: 8, minWidth: 0 },
  incRow: {
    alignItems: 'flex-start', borderRadius: AppTheme.radius.sm, borderWidth: 1,
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, minWidth: 0, padding: 10,
  },
  incIcon: {
    alignItems: 'center', borderRadius: AppTheme.radius.xs, flexShrink: 0,
    height: 38, justifyContent: 'center', width: 38,
  },
  incBody: { flex: 1, flexBasis: 180, gap: 2, minWidth: 0 },
  incTitle: { fontFamily: Typography.body, fontSize: 14, fontWeight: '900' },
  incMeta: { fontFamily: Typography.body, fontSize: 11, lineHeight: 16 },
  incBadges: { alignItems: 'flex-end', flexDirection: 'row', flexShrink: 0, flexWrap: 'wrap', gap: 4 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  detailField: { flexBasis: 140, flexGrow: 1, gap: 4 },
  detailLabel: {
    color: portalPalette.muted, fontFamily: Typography.body, fontSize: 11,
    fontWeight: '900', textTransform: 'uppercase',
  },
  detailValue: { fontFamily: Typography.body, fontSize: 13 },
  detailDescription: { fontFamily: Typography.body, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  mediaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  mediaThumb: {
    alignItems: 'center', borderRadius: AppTheme.radius.xs,
    height: 48, justifyContent: 'center', width: 48,
  },
  actionButton: {
    alignItems: 'center', alignSelf: 'flex-start', borderRadius: AppTheme.radius.sm,
    flexDirection: 'row', gap: 6, minHeight: 38, paddingHorizontal: 14,
  },
  actionButtonText: { color: '#FFFFFF', fontFamily: Typography.body, fontSize: 12, fontWeight: '900' },
  iconAction: {
    alignItems: 'center', borderRadius: AppTheme.radius.xs, flexShrink: 0,
    height: 32, justifyContent: 'center', width: 32,
  },
  statusSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, minWidth: 0, paddingVertical: 8 },
  statusOption: {
    borderRadius: AppTheme.radius.sm, borderWidth: 1, flexGrow: 1,
    minHeight: 38, paddingHorizontal: 12, paddingVertical: 9,
  },
  statusOptionText: {
    fontFamily: Typography.body, fontSize: 12, fontWeight: '900', textAlign: 'center',
  },
});
