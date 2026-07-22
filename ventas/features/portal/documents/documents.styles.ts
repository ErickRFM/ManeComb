import { StyleSheet } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { portalPalette } from '../portal-theme';

export const styles = StyleSheet.create({
  contextNotice: {
    alignItems: 'flex-start',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: AppTheme.spacing.md,
  },
  contextIcon: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    flexShrink: 0,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  contextCopy: {
    flex: 1,
    flexBasis: 260,
    minWidth: 0,
  },
  contextTitle: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  contextText: {
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    borderColor: portalPalette.lineStrong,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: portalPalette.accent,
    borderColor: portalPalette.accent,
  },
  filterChipText: {
    color: portalPalette.text,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  docIcon: {
    alignItems: 'center',
    flexShrink: 0,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  docName: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  docMeta: {
    fontFamily: Typography.body,
    fontSize: 11,
    lineHeight: 16,
  },
  rowActions: {
    flexDirection: 'row',
    flexShrink: 0,
    flexWrap: 'wrap',
    gap: 6,
  },
  iconAction: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    flexShrink: 0,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  reviewSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
    paddingVertical: 8,
  },
  reviewOption: {
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  reviewOptionText: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  reviewInput: {
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    fontFamily: Typography.body,
    fontSize: 13,
    minHeight: 60,
    padding: 10,
    textAlignVertical: 'top',
  },
});
