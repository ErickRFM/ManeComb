import { StyleSheet } from 'react-native';
import { AppTheme, DesignSystem, Typography } from '@/constants/theme';
import { portalPalette } from '../portal-theme';

export const styles = StyleSheet.create({
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, minWidth: 0 },
  input: {
    borderRadius: AppTheme.radius.sm, borderWidth: 1, flex: 1, flexBasis: 220,
    fontFamily: Typography.body, fontSize: 14, minHeight: 46, minWidth: 0, paddingHorizontal: 14,
  },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, minWidth: 0 },
  segment: {
    alignItems: 'center', borderRadius: AppTheme.radius.sm, borderWidth: 1, flexShrink: 1,
    justifyContent: 'center', minHeight: DesignSystem.control.touch, paddingHorizontal: 12, paddingVertical: 9,
  },
  segmentText: { fontFamily: Typography.body, fontSize: 12, fontWeight: '900' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', minWidth: 0 },
  primaryButton: {
    alignItems: 'center', borderRadius: AppTheme.radius.sm, flexDirection: 'row', flexShrink: 0,
    gap: 8, justifyContent: 'center', minHeight: DesignSystem.control.touch, paddingHorizontal: 14,
  },
  primaryText: {
    color: '#FFFFFF', flexShrink: 1, fontFamily: Typography.body, fontSize: 13, fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center', borderRadius: AppTheme.radius.sm, borderWidth: 1, flexShrink: 0,
    justifyContent: 'center', minHeight: DesignSystem.control.touch, paddingHorizontal: 14,
  },
  secondaryText: { fontFamily: Typography.body, fontSize: 13, fontWeight: '900' },
  list: { gap: 10, minWidth: 0 },
  unitRow: {
    alignItems: 'flex-start', borderRadius: AppTheme.radius.sm, borderWidth: 1,
    flexDirection: 'row', flexWrap: 'wrap', gap: 12, minWidth: 0, padding: 12,
  },
  unitIcon: {
    alignItems: 'center', borderRadius: AppTheme.radius.xs, flexShrink: 0,
    height: 38, justifyContent: 'center', width: 38,
  },
  unitBody: { flex: 1, flexBasis: 260, minWidth: 0 },
  unitName: { fontFamily: Typography.body, fontSize: 14, fontWeight: '900', minWidth: 0 },
  unitMeta: { fontFamily: Typography.body, fontSize: 12, lineHeight: 18, minWidth: 0 },
  rowActions: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: 8 },
  iconAction: {
    alignItems: 'center', borderRadius: AppTheme.radius.xs, flexShrink: 0,
    height: DesignSystem.control.touch, justifyContent: 'center', width: DesignSystem.control.touch,
  },
  operationalFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, minWidth: 0 },
  quickAction: {
    alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)', borderRadius: AppTheme.radius.xs,
    borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: DesignSystem.control.touch, paddingHorizontal: 9,
  },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  quickActionText: { color: '#FFFFFF', fontFamily: Typography.body, fontSize: 11, fontWeight: '900' },
  unitFact: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: AppTheme.radius.xs, borderWidth: 1, flex: 1, flexBasis: 125,
    gap: 3, minWidth: 0, padding: 9,
  },
  unitFactLabel: { color: '#A8B1C2', fontFamily: Typography.body, fontSize: 11, fontWeight: '800' },
  unitFactValue: {
    color: '#F4F7FB', fontFamily: Typography.body, fontSize: 12, fontWeight: '900', lineHeight: 17,
  },
  maintenanceRow: {
    alignItems: 'center', borderColor: portalPalette.line, borderRadius: AppTheme.radius.xs,
    borderWidth: 1, flexDirection: 'row', gap: 6, marginTop: 6,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  continuityBanner: {
    alignItems: 'center', borderRadius: AppTheme.radius.sm, borderWidth: 1,
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12,
  },
  continuityText: {
    flex: 1, flexBasis: 200, fontFamily: Typography.body, fontSize: 13,
    fontWeight: '800', minWidth: 0,
  },
  continuityButton: {
    alignItems: 'center', borderRadius: AppTheme.radius.sm, flexDirection: 'row',
    flexShrink: 0, gap: 6, minHeight: DesignSystem.control.touch, paddingHorizontal: 12,
  },
  continuityButtonText: { color: '#FFFFFF', fontFamily: Typography.body, fontSize: 12, fontWeight: '900' },
  disabledButton: { opacity: 0.55 },
  filterBar: { flexDirection: 'row', flexWrap: 'wrap', gap: AppTheme.spacing.sm, minWidth: 0 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: AppTheme.spacing.sm },
  summaryItem: {
    borderRadius: AppTheme.radius.sm, borderWidth: 1, flex: 1, flexBasis: 110,
    gap: AppTheme.spacing.xs, minWidth: 0, padding: AppTheme.spacing.sm,
  },
  summaryValue: { fontFamily: Typography.display, fontSize: 22, fontWeight: '900' },
  checklist: { gap: AppTheme.spacing.xs },
});
