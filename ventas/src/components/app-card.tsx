import { useState, type PropsWithChildren } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { DesignSystem, elevation, palette } from '@/constants/theme';
import { transition } from '@/src/native/motion';

type AppCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  /** Activa el realce al pasar el cursor (solo web). */
  interactive?: boolean;
}>;

const isWeb = Platform.OS === 'web';

export function AppCard({ children, style, interactive = false }: AppCardProps) {
  const [hovered, setHovered] = useState(false);
  const lifted = isWeb && interactive && hovered;
  const hoverProps =
    isWeb && interactive
      ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
      : {};

  return (
    <View
      {...(hoverProps as object)}
      style={[
        styles.card,
        {
          backgroundColor: palette.card,
          borderColor: lifted ? palette.lineStrong : palette.line,
          ...(isWeb
            ? {
                ...transition('transform, box-shadow, border-color', DesignSystem.motion.normal),
                transform: [{ translateY: lifted ? -3 : 0 }],
                boxShadow: lifted
                  ? `0px 18px 40px ${elevation.card.shadowColor}`
                  : `0px ${elevation.card.shadowOffset.height}px ${elevation.card.shadowRadius}px ${elevation.card.shadowColor}`,
              }
            : {
                shadowColor: elevation.card.shadowColor,
                shadowOpacity: elevation.card.shadowOpacity,
                shadowRadius: elevation.card.shadowRadius,
                shadowOffset: elevation.card.shadowOffset,
                elevation: elevation.card.elevation,
              }),
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: DesignSystem.radius.card,
    padding: DesignSystem.spacing.md,
    gap: DesignSystem.spacing.sm,
    minWidth: 0,
  },
});
