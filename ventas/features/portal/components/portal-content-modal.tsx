import type { ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { AppTheme, palette, Typography } from '@/constants/theme';
import { transition } from '@/src/native/motion';
import { portalGlass, portalPalette } from '../portal-theme';

type PortalContentModalProps = {
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  subtitle?: string;
  title: string;
  visible: boolean;
  width?: 'md' | 'lg';
};

export function PortalContentModal({
  children,
  footer,
  onClose,
  subtitle,
  title,
  visible,
  width = 'md',
}: PortalContentModalProps) {
  const { height, width: viewportWidth } = useWindowDimensions();
  const compact = viewportWidth < 720;
  const panelMaxWidth = width === 'lg' ? 820 : 680;

  return (
    <Modal
      accessibilityViewIsModal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}>
      <View style={[styles.overlay, { backgroundColor: palette.overlay }]}>
        <Pressable
          accessibilityLabel="Cerrar ventana"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.panel,
            portalGlass(),
            {
              maxHeight: Math.max(360, height - (compact ? 28 : 72)),
              maxWidth: panelMaxWidth,
            },
            compact ? styles.panelCompact : undefined,
          ]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text accessibilityRole="header" style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable
              accessibilityLabel={`Cerrar ${title}`}
              accessibilityRole="button"
              onPress={onClose}
              style={({ hovered, pressed }: any) => [
                styles.closeButton,
                transition('background-color, transform, opacity', 140),
                hovered ? styles.closeButtonHover : undefined,
                pressed ? styles.closeButtonPressed : undefined,
              ]}>
              <MaterialCommunityIcons name="close" size={20} color={portalPalette.text} />
            </Pressable>
          </View>

          <ScrollView
            {...({ className: 'portal-scrollbar' } as any)}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={Platform.OS !== 'web'}
            style={styles.scroll}>
            {children}
          </ScrollView>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: AppTheme.spacing.lg,
  },
  panel: {
    backgroundColor: portalPalette.surfaceStrong,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.lg,
    borderWidth: 1,
    minHeight: 0,
    overflow: 'hidden',
    width: '100%',
  },
  panelCompact: {
    borderRadius: AppTheme.radius.md,
  },
  header: {
    alignItems: 'flex-start',
    borderBottomColor: portalPalette.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: AppTheme.spacing.md,
    justifyContent: 'space-between',
    padding: AppTheme.spacing.lg,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  title: {
    color: portalPalette.text,
    fontFamily: Typography.display,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
  },
  subtitle: {
    color: portalPalette.muted,
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexShrink: 0,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  closeButtonHover: {
    backgroundColor: portalPalette.accentSoft,
  },
  closeButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },
  scroll: {
    flexShrink: 1,
    minHeight: 0,
  },
  content: {
    gap: AppTheme.spacing.md,
    padding: AppTheme.spacing.lg,
  },
  footer: {
    alignItems: 'center',
    borderTopColor: portalPalette.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppTheme.spacing.sm,
    justifyContent: 'flex-end',
    padding: AppTheme.spacing.md,
  },
});
