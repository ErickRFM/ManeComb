import { StyleSheet } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';

export const styles = StyleSheet.create({
  disabledButton: { opacity: 0.55 },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, minWidth: 0 },
  input: {
    borderRadius: AppTheme.radius.sm, borderWidth: 1, flex: 1, flexBasis: 220,
    fontFamily: Typography.body, fontSize: 14, minHeight: 46, minWidth: 0, paddingHorizontal: 14,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', minWidth: 0 },
  primaryButton: {
    alignItems: 'center', borderRadius: AppTheme.radius.sm, flexShrink: 0,
    flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 42, paddingHorizontal: 14,
  },
  primaryText: { color: '#FFFFFF', fontFamily: Typography.body, fontSize: 13, fontWeight: '900', flexShrink: 1 },
  sessionList: { gap: 10, minWidth: 0 },
  sessionRow: {
    alignItems: 'flex-start', borderRadius: AppTheme.radius.sm, borderWidth: 1,
    flexDirection: 'row', flexWrap: 'wrap', gap: 12, minWidth: 0, padding: 12,
  },
  sessionBody: { flex: 1, flexBasis: 240, minWidth: 0 },
  sessionTitle: { fontFamily: Typography.body, fontSize: 14, fontWeight: '900', minWidth: 0 },
  sessionMeta: { fontFamily: Typography.body, fontSize: 12, lineHeight: 18, minWidth: 0 },
  iconButton: {
    alignItems: 'center', borderRadius: AppTheme.radius.xs, flexShrink: 0,
    height: 36, justifyContent: 'center', width: 36,
  },
  supportGrid: { gap: 10, minWidth: 0 },
  supportItem: {
    alignItems: 'flex-start', borderRadius: AppTheme.radius.sm, borderWidth: 1,
    flexDirection: 'row', flexWrap: 'wrap', gap: 12, minWidth: 0, padding: 12,
  },
  supportCopy: { flex: 1, flexBasis: 240, minWidth: 0 },
});
