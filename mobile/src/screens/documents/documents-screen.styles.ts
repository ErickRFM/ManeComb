import { StyleSheet } from 'react-native';
import { DesignSystem, Typography } from '@/constants/theme';

export function createDocumentStyles(theme: any) {
  return StyleSheet.create({
    header: { gap: DesignSystem.spacing.xs },
    title: { color: theme.colors.text, fontFamily: Typography.display, fontSize: DesignSystem.typography.title.size, fontWeight: '900' },
    subtitle: { color: theme.colors.muted, fontFamily: Typography.body, fontSize: DesignSystem.typography.body.size },
    toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: DesignSystem.spacing.sm, justifyContent: 'space-between' },
    primaryButton: { alignItems: 'center', backgroundColor: theme.colors.accent, borderRadius: DesignSystem.radius.control, flexDirection: 'row', gap: DesignSystem.spacing.xs, minHeight: DesignSystem.control.md, paddingHorizontal: DesignSystem.spacing.md, justifyContent: 'center' },
    primaryText: { color: '#FFFFFF', fontFamily: Typography.body, fontWeight: '900' },
    list: { gap: DesignSystem.spacing.md },
    cardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: DesignSystem.spacing.sm, justifyContent: 'space-between' },
    copy: { flex: 1, gap: DesignSystem.spacing.xs },
    name: { color: theme.colors.text, fontFamily: Typography.body, fontSize: DesignSystem.typography.subtitle.size, fontWeight: '900' },
    meta: { color: theme.colors.muted, fontFamily: Typography.body, fontSize: DesignSystem.typography.caption.size, lineHeight: DesignSystem.typography.caption.lineHeight },
    note: { backgroundColor: theme.colors.dangerSoft, borderRadius: DesignSystem.radius.card, color: theme.colors.danger, fontFamily: Typography.body, padding: DesignSystem.spacing.sm },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: DesignSystem.spacing.xs, marginTop: DesignSystem.spacing.sm },
    action: { borderColor: theme.colors.line, borderRadius: DesignSystem.radius.control, borderWidth: 1, minHeight: DesignSystem.control.sm, paddingHorizontal: DesignSystem.spacing.sm, justifyContent: 'center' },
    actionText: { color: theme.colors.text, fontFamily: Typography.body, fontSize: DesignSystem.typography.caption.size, fontWeight: '800' },
    dangerText: { color: theme.colors.danger },
    empty: { color: theme.colors.muted, fontFamily: Typography.body, textAlign: 'center' },
    overlay: { alignItems: 'center', backgroundColor: theme.colors.overlay, flex: 1, justifyContent: 'center', padding: DesignSystem.spacing.lg },
    modal: { backgroundColor: theme.colors.card, borderColor: theme.colors.line, borderRadius: DesignSystem.radius.sheet, borderWidth: 1, gap: DesignSystem.spacing.md, maxWidth: 520, padding: DesignSystem.spacing.lg, width: '100%' },
    modalTitle: { color: theme.colors.text, fontFamily: Typography.display, fontSize: DesignSystem.typography.title.size, fontWeight: '900' },
    label: { color: theme.colors.text, fontFamily: Typography.body, fontSize: DesignSystem.typography.caption.size, fontWeight: '800' },
    input: { borderColor: theme.colors.line, borderRadius: DesignSystem.radius.input, borderWidth: 1, color: theme.colors.text, fontFamily: Typography.body, minHeight: DesignSystem.control.md, paddingHorizontal: DesignSystem.spacing.md },
    fileBox: { backgroundColor: theme.colors.surfaceAlt, borderRadius: DesignSystem.radius.card, gap: DesignSystem.spacing.xs, padding: DesignSystem.spacing.md },
    message: { color: theme.colors.danger, fontFamily: Typography.body },
    modalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: DesignSystem.spacing.sm, justifyContent: 'flex-end' },
    secondaryButton: { borderColor: theme.colors.line, borderRadius: DesignSystem.radius.control, borderWidth: 1, minHeight: DesignSystem.control.md, paddingHorizontal: DesignSystem.spacing.md, justifyContent: 'center' },
    secondaryText: { color: theme.colors.text, fontFamily: Typography.body, fontWeight: '800' },
    historyRow: { borderBottomColor: theme.colors.line, borderBottomWidth: 1, gap: DesignSystem.spacing.xs, paddingVertical: DesignSystem.spacing.sm },
  });
}
