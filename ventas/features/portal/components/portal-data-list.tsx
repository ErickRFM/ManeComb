import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppTheme } from '@/constants/theme';
import { transition } from '@/src/native/motion';
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
          transition('background-color, border-color, transform, opacity', 150),
          hovered && !selected ? styles.hovered : undefined,
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
    gap: 8,
    minWidth: 0,
  },
  row: {
    alignItems: 'flex-start',
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    minWidth: 0,
    padding: 12,
  },
  selected: {
    backgroundColor: portalPalette.infoSoft,
    borderColor: portalPalette.info,
  },
  hovered: {
    backgroundColor: 'rgba(255, 255, 255, 0.075)',
    borderColor: portalPalette.lineStrong,
  },
  pressed: {
    backgroundColor: portalPalette.accentSoft,
    opacity: 0.9,
    transform: [{ scale: 0.995 }],
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
    alignSelf: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    flexWrap: 'wrap',
    gap: AppTheme.spacing.xs,
    justifyContent: 'flex-end',
    maxWidth: '100%',
  },
});
