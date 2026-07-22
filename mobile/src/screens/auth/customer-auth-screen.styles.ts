import { StyleSheet } from 'react-native';
import { DesignSystem, Typography } from '@/constants/theme';

export const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  panel: {
    width: '100%',
    maxWidth: 420,
    flexGrow: 1,
  },
  loginPanel: {
    justifyContent: 'space-between',
  },
  brandRow: {
    alignItems: 'flex-start',
  },
  artworkWrap: {
    alignItems: 'center',
    marginTop: 8,
  },
  slogan: {
    marginTop: 0,
    color: '#71788A',
    fontFamily: Typography.brand,
    // Sin fontWeight a proposito: en Android RN resuelve la fuente como
    // assets/fonts/<fontFamily><_bold|_italic>.ttf. Con fontWeight '700' buscaria
    // magneto-bold_bold.ttf, no lo encontraria y caeria en silencio a la fuente del
    // sistema. Magneto ya es un solo corte bold, asi que no se pierde nada.
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
  },
  form: {
    marginTop: 12,
    gap: 18,
  },
  segmentedControl: {
    minHeight: 42,
    borderRadius: 7,
    backgroundColor: '#EAE5DD',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  unitCombo: {
    gap: 6,
  },
  unitComboTrigger: {
    minHeight: DesignSystem.control.md,
    borderRadius: DesignSystem.radius.input,
    borderWidth: 1.5,
    borderColor: '#2F2F2F',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  unitComboValue: {
    flex: 1,
    color: '#333333',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '700',
  },
  unitComboPlaceholder: {
    flex: 1,
    color: '#71788A',
    fontFamily: Typography.body,
    fontSize: 13,
  },
  unitComboMenu: {
    borderRadius: DesignSystem.radius.input,
    borderWidth: 1,
    borderColor: '#D8D2C8',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  unitComboOption: {
    minHeight: DesignSystem.control.md,
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  unitComboOptionActive: {
    backgroundColor: '#FDF3F3',
  },
  unitCode: {
    color: '#333333',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '700',
  },
  unitDetails: {
    color: '#71788A',
    fontFamily: Typography.body,
    fontSize: 11,
    lineHeight: 15,
  },
  unitPlaceholder: {
    minHeight: DesignSystem.control.md,
    borderRadius: DesignSystem.radius.input,
    borderWidth: 1.5,
    borderColor: '#D8D2C8',
    backgroundColor: '#FAF8F5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  unitEmptyText: {
    color: '#71788A',
    fontFamily: Typography.body,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  segmentButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  segmentButtonActive: {
    backgroundColor: '#EA1F23',
  },
  segmentText: {
    color: '#333333',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '800',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  fields: {
    gap: 16,
  },
  field: {
    gap: 10,
  },
  fieldLabel: {
    color: '#333333',
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '400',
  },
  inputShell: {
    minHeight: DesignSystem.control.md,
    borderRadius: DesignSystem.radius.input,
    borderWidth: 1.5,
    borderColor: '#2F2F2F',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    minHeight: DesignSystem.control.md,
    flex: 1,
    color: '#333333',
    fontFamily: Typography.body,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  inputWithToggle: {
    paddingRight: 44,
  },
  passwordToggle: {
    position: 'absolute',
    right: 6,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#EA1F23',
    borderColor: '#EA1F23',
  },
  checkboxDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FFFFFF',
  },
  smallActionText: {
    color: '#333333',
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 17,
  },
  recoveryActionText: {
    color: '#EA1F23',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '700',
  },
  recoveryNavigation: {
    alignItems: 'center',
    gap: 10,
  },
  messageBox: {
    borderRadius: 12,
    backgroundColor: '#FDE7E8',
    borderWidth: 1,
    borderColor: '#EA1F23',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  messageText: {
    color: '#C4171C',
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  successBox: {
    backgroundColor: '#EAF7EE',
    borderColor: '#2F9E44',
  },
  successText: {
    color: '#237A35',
  },
  primaryButton: {
    minHeight: 40,
    borderRadius: 7,
    backgroundColor: '#EA1F23',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  legalBlock: {
    alignItems: 'center',
    gap: 2,
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
    color: '#111111',
    fontFamily: Typography.body,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
  legalLink: {
    color: '#EA1F23',
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
