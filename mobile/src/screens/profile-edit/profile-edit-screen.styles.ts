import { StyleSheet } from 'react-native';
import { AppTheme, DesignSystem, Typography } from '@/constants/theme';
import type { useAppTheme } from '@/src/hooks/use-app-theme';

export function createStyles(theme: ReturnType<typeof useAppTheme>['theme'], isPhone = false) {
  return StyleSheet.create({
    header: {
      gap: AppTheme.spacing.md,
      paddingTop: AppTheme.spacing.md,
    },
    backButton: {
      alignSelf: 'flex-start',
      minHeight: 42,
      borderRadius: AppTheme.radius.pill,
      borderWidth: 1,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    backButtonText: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '700',
    },
    title: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: isPhone ? 26 : 30,
      fontWeight: '900',
    },
    subtitle: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 15,
      lineHeight: 24,
      maxWidth: 760,
    },
    editorCard: {
      backgroundColor: theme.colors.surface,
      gap: AppTheme.spacing.lg,
    },
    topRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: AppTheme.spacing.lg,
      alignItems: 'center',
      padding: AppTheme.spacing.md,
      borderRadius: AppTheme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
    },
    avatarColumn: {
      gap: AppTheme.spacing.sm,
      alignItems: 'center',
    },
    identityBlock: {
      flex: 1,
      gap: 8,
    },
    userName: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 30,
    },
    userMeta: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 14,
    },
    identityPills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    passwordHelperCard: {
      borderRadius: AppTheme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: AppTheme.spacing.md,
      paddingVertical: 12,
      gap: 6,
    },
    passwordHelperTitle: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '800',
    },
    passwordHelperValue: {
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '800',
    },
    passwordHelperValueWeak: {
      color: theme.colors.accent,
    },
    passwordHelperValueMedium: {
      color: theme.colors.warning,
    },
    passwordHelperValueStrong: {
      color: theme.colors.success,
    },
    formGrid: {
      gap: 12,
      padding: AppTheme.spacing.md,
      borderRadius: AppTheme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
    },
    inlineGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    sectionHeading: {
      color: theme.colors.text,
      fontFamily: Typography.display,
      fontSize: 20,
      fontWeight: '900',
      marginTop: 4,
    },
    field: {
      gap: 8,
      flex: 1,
      minWidth: 170,
    },
    fieldLabel: {
      color: theme.colors.muted,
      fontFamily: Typography.body,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    input: {
      minHeight: DesignSystem.control.md,
      borderRadius: DesignSystem.radius.input,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.input,
      paddingHorizontal: AppTheme.spacing.md,
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 15,
    },
    methodRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    methodChip: {
      minHeight: 42,
      borderRadius: AppTheme.radius.pill,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surfaceAlt,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    methodChipActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    methodChipText: {
      color: theme.colors.text,
      fontFamily: Typography.body,
      fontSize: 13,
      fontWeight: '700',
    },
    methodChipTextActive: {
      color: theme.colors.accent,
    },
    messageBox: {
      borderRadius: AppTheme.radius.md,
      borderWidth: 1,
      paddingHorizontal: AppTheme.spacing.md,
      paddingVertical: 12,
    },
    successBox: {
      backgroundColor: theme.colors.successSoft,
      borderColor: theme.colors.success,
    },
    errorBox: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent,
    },
    messageText: {
      fontFamily: Typography.body,
      fontSize: 14,
      fontWeight: '700',
    },
    successText: {
      color: theme.colors.success,
    },
    errorText: {
      color: theme.colors.accent,
    },
    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      justifyContent: 'flex-end',
      paddingTop: 8,
    },
  });
}
