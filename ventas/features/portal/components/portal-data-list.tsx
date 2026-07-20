import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppTheme } from '@/constants/theme';
import { portalPalette } from '../portal-theme';

type PortalDataListProps = {
  children: ReactNode;
};

type PortalDataRowProps = {
  actions?: ReactNode;
  body: ReactNode;
  leading?: ReactNode;
  meta?: ReactNode;
  onPress?: () => void;
  selected?: boolean;
};

export function PortalDataList({ children }: PortalDataListProps) {
  return <View style={styles.list}>{children}</View>;
}

export function PortalDataRow({ actions, body, leading, meta, onPress, selected = false }: PortalDataRowProps) {
  const content = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.body}>{body}</View>
      {meta ? <View style={styles.meta}>{meta}</View> : null}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </>
  );

  const rowStyle = [styles.row, selected ? styles.selected : undefined];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ hovered, pressed }: any) => [
          ...rowStyle,
          hovered ? styles.hovered : undefined,
          pressed ? styles.pressed : undefined,
        ]}>
        {content}
      </Pressable>
    );
  }

  return <View style={rowStyle}>{content}</View>;
}

const styles = StyleSheet.create({
  list: {
    gap: AppTheme.spacing.sm,
    minWidth: 0,
  },
  row: {
    alignItems: 'flex-start',
    backgroundColor: portalPalette.surface,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppTheme.spacing.sm,
    minWidth: 0,
    padding: AppTheme.spacing.md,
  },
  selected: {
    backgroundColor: portalPalette.infoSoft,
    borderColor: portalPalette.info,
  },
  hovered: {
    backgroundColor: portalPalette.surfaceSoft,
  },
  pressed: {
    backgroundColor: portalPalette.accentSoft,
  },
  leading: {
    flexShrink: 0,
  },
  body: {
    flex: 1,
    flexBasis: 190,
    minWidth: 0,
  },
  meta: {
    alignItems: 'flex-start',
    flexShrink: 0,
    maxWidth: '100%',
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    flexWrap: 'wrap',
    gap: AppTheme.spacing.xs,
    justifyContent: 'flex-end',
    maxWidth: '100%',
  },
});
