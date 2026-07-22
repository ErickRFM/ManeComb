import { Platform, StyleSheet } from 'react-native';
import { Typography } from '@/constants/theme';
import { authPalette as c } from './auth.constants';

export const authStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: c.background,
    ...(Platform.OS === 'web'
      ? ({ minHeight: '100dvh', overflow: 'visible' } as any)
      : { overflow: 'hidden' as const }),
  },
  flex: {
    flex: 1,
    ...(Platform.OS === 'web' ? ({ minHeight: '100dvh' } as any) : {}),
  },
  scroll: {
    flex: 1,
    ...(Platform.OS === 'web' ? ({ overflow: 'visible' } as any) : {}),
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  backgroundBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: c.background,
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: -150,
    right: -110,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: c.accentGlow,
  },
  backgroundGlowBottom: {
    position: 'absolute',
    left: -140,
    bottom: -150,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: c.accentGlowBottom,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    width: '100%',
  },
  brandRow: {
    alignItems: 'center',
    gap: 8,
  },
  logoWrap: {
    alignItems: 'center',
    maxWidth: '100%',
  },
  portalBadge: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: c.badgeBg,
    borderColor: c.accentBorder,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 30,
    paddingHorizontal: 12,
  },
  portalBadgeText: {
    color: c.badgeText,
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  form: {
    borderColor: c.border,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: `linear-gradient(145deg, ${c.panelBg}, ${c.panelBgEnd})`,
          backdropFilter: 'blur(18px)',
          boxShadow: c.formShadow,
        } as any)
      : {
          backgroundColor: c.panelBg,
          shadowColor: c.shadowColor,
          shadowOpacity: 0.16,
          shadowRadius: 28,
          shadowOffset: { width: 0, height: 18 },
          elevation: 8,
        }),
  },
  headingBlock: {
    alignItems: 'center',
    gap: 5,
  },
  title: {
    color: c.text,
    fontFamily: Typography.display,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 32,
    textAlign: 'center',
  },
  subtitle: {
    color: c.muted,
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  segmentedControl: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: c.segmentBg,
    borderColor: c.borderSegment,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  segmentButtonActive: {
    backgroundColor: c.segmentActive,
  },
  segmentText: {
    color: c.mutedSoft,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  fields: {
    gap: 13,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: c.fieldLabel,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: c.inputBg,
    borderColor: c.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 13,
  },
  inputShellFocused: {
    borderColor: c.accentBorderFocus,
    backgroundColor: c.inputBgFocus,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: `0 0 0 3px ${c.borderFocusGlow}` } as any)
      : {
          shadowColor: c.shadowColor,
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        }),
  },
  input: {
    color: c.text,
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  passwordToggle: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 2,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  sessionRow: {
    minHeight: 22,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rememberButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: c.checkboxBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: c.checkboxActive,
    borderColor: c.checkboxActive,
  },
  checkboxDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FFFFFF',
  },
  smallActionText: {
    color: c.mutedText,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  messageBox: {
    borderRadius: 12,
    backgroundColor: c.messageBg,
    borderWidth: 1,
    borderColor: c.messageBorder,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  messageText: {
    color: c.messageText,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage: c.buttonGradient,
          boxShadow: c.buttonShadow,
        } as any)
      : {
          shadowColor: c.shadowColor,
          shadowOpacity: 0.3,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 5,
        }),
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  legalBlock: {
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 4,
  },
  legalLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 3,
  },
  legalText: {
    color: c.legalText,
    fontFamily: Typography.body,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
  legalLink: {
    color: c.legalLink,
    fontFamily: Typography.body,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 15,
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.7,
  },
});
